import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createGoogleReportingClient, GoogleReportingError, sanitizeReportingError } from "../lib/google-reporting";

// Entirely synthetic, generated in memory. No deployed credential/env-file reads.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const credentials = { type: "service_account", project_id: "localpro-501816", client_email: "localpro-analytics-reader@localpro-501816.iam.gserviceaccount.com", private_key: pem, token_uri: "https://attacker.invalid/steal" };
const env = { GOOGLE_REPORTING_CREDENTIALS_JSON: JSON.stringify(credentials), GOOGLE_REPORTING_GA4_PROPERTY_ID: "559398175", GOOGLE_REPORTING_GSC_SITE_URL: "sc-domain:localpro.lt" };
const epoch = Date.UTC(2026, 9, 17, 12);
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers });
const oauth = (url: string) => url === "https://oauth2.googleapis.com/token";
function harness(handler?: (url: string, init: RequestInit) => Response | Promise<Response>) {
  let clock = epoch;
  let tokenCount = 0;
  const sleeps: number[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (handler) return handler(url, init!);
    if (oauth(url)) return json({ access_token: `synthetic-token-${++tokenCount}`, expires_in: 3600, token_type: "Bearer" });
    return json({ rows: [] });
  });
  const client = createGoogleReportingClient({ fetch: fetcher as typeof fetch, env, now: () => clock, sleep: async ms => { sleeps.push(ms); }, random: () => 1 });
  return { client, fetcher, sleeps, advance: (ms: number) => { clock += ms; } };
}
function timedHarness(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  vi.useFakeTimers();
  vi.setSystemTime(epoch);
  const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit) => handler(String(input), init!));
  const client = createGoogleReportingClient({ fetch: fetcher as typeof fetch, env, random: () => 1 });
  return { client, fetcher };
}
const later = (ms: number, response: Response) => new Promise<Response>(resolve => setTimeout(() => resolve(response), ms));
const timeoutResult = { status: "error", error: { code: "TIMEOUT", httpStatus: null, retryable: true } };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("server Google reporting", () => {
  it("signs real RS256 JWT with only read-only scopes, fixed audience/endpoints, allowlisted reports", async () => {
    const h = harness();
    const result = await h.client.getSnapshot({ window: "7d", includeConversions: true });
    expect(result.status).toBe("success");
    const [url, init] = h.fetcher.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const assertion = new URLSearchParams(init!.body as string).get("assertion")!;
    const [head, payload, signature] = assertion.split(".");
    expect(JSON.parse(Buffer.from(head, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims).toEqual({ iss: credentials.client_email, aud: url, scope: "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly", iat: epoch / 1000, exp: epoch / 1000 + 3600 });
    expect(verify("RSA-SHA256", Buffer.from(`${head}.${payload}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    expect(h.fetcher).toHaveBeenCalledTimes(5);
    const reports = h.fetcher.mock.calls.slice(1).map(([u, i]) => ({ url: String(u), body: JSON.parse(i!.body as string), init: i! }));
    const daily = reports.find(r => r.body.dimensions[0]?.name === "date")!;
    expect(daily.body).toMatchObject({ dateRanges: [{ startDate: "2026-10-10", endDate: "2026-10-16" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "eventCount" }], returnPropertyQuota: true });
    const conversion = reports.find(r => r.body.dimensionFilter)!;
    expect(conversion.body.dimensionFilter.filter.inListFilter.values).toEqual(["generate_lead", "sign_up", "contact_click"]);
    const gsc = reports.find(r => r.url.includes("webmasters"))!;
    expect(gsc.body).toEqual({ startDate: "2026-10-08", endDate: "2026-10-14", dimensions: ["date"], type: "web", dataState: "final", rowLimit: 90 });
    for (const report of reports) {
      expect(report.url).not.toContain("attacker");
      expect(report.init.redirect).toBe("error");
      expect(report.init.cache).toBe("no-store");
      expect(report.init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("distinguishes 200 zero rows (including omitted rows) from source failures", async () => {
    const h = harness((url) => oauth(url) ? json({ access_token: "token", expires_in: 3600 }) : url.includes("webmasters") ? json({ error: { message: "upstream secret" } }, 403) : json({}));
    const result = await h.client.getSnapshot();
    expect(result.status).toBe("partial");
    expect(result.ga4).toMatchObject({ status: "success", empty: true, data: { rows: [] } });
    expect(result.realtime.status).toBe("success");
    expect(result.searchConsole).toEqual({ status: "error", error: { code: "FORBIDDEN", httpStatus: 403, retryable: false } });
    expect(h.sleeps).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("upstream secret");
  });

  it("normalizes rows and quotas without returning arbitrary upstream fields", async () => {
    const h = harness(url => {
      if (oauth(url)) return json({ access_token: "TOKEN_SECRET", expires_in: 3600 });
      if (url.includes("webmasters")) return json({ rows: [{ keys: ["2026-10-10"], clicks: 2, impressions: 20, ctr: 0.1, position: 3, secret: pem }], secret: pem });
      if (url.endsWith("runRealtimeReport")) return json({ rows: [{ dimensionValues: [{ value: "page_view" }], metricValues: [{ value: "5" }] }] });
      return json({ rows: [{ dimensionValues: [{ value: "20261010" }], metricValues: [{ value: "2" }, { value: "3" }, { value: "5" }] }], propertyQuota: { tokensPerDay: { consumed: 3, remaining: 199997, secret: pem }, unknown: pem }, secret: pem });
    });
    const result = await h.client.getSnapshot();
    expect(result.ga4).toMatchObject({ status: "success", empty: false, data: { rows: [{ date: "2026-10-10", activeUsers: 2, sessions: 3, eventCount: 5 }], quota: { tokensPerDay: { consumed: 3, remaining: 199997 } } } });
    expect(result.realtime).toMatchObject({ data: { rows: [{ eventName: "page_view", eventCount: 5 }] } });
    expect(result.searchConsole).toMatchObject({ data: { rows: [{ date: "2026-10-10", clicks: 2, impressions: 20, ctr: 0.1, position: 3 }] } });
    expect(JSON.stringify(result)).not.toMatch(/TOKEN_SECRET|PRIVATE KEY|unknown|secret/);
  });

  it("single-flights concurrent OAuth and identical report requests; caches and clones successes", async () => {
    const h = harness();
    const results = await Promise.all(Array.from({ length: 12 }, () => h.client.getSnapshot()));
    expect(h.fetcher).toHaveBeenCalledTimes(4);
    expect(results.every(r => r.status === "success")).toBe(true);
    if (results[0].ga4.status === "success") results[0].ga4.data.rows.push({ date: "bad", activeUsers: 1, sessions: 1, eventCount: 1 });
    expect((await h.client.getSnapshot()).ga4).toMatchObject({ empty: true, data: { rows: [] } });
    expect(h.fetcher).toHaveBeenCalledTimes(4);
    h.advance(30_001);
    await h.client.getSnapshot();
    expect(h.fetcher).toHaveBeenCalledTimes(5); // realtime only
    h.advance(300_000);
    await h.client.getSnapshot();
    expect(h.fetcher).toHaveBeenCalledTimes(7); // GA daily + realtime; GSC still cached
  });

  it("renews before expiry and single-flights renewal across different reports", async () => {
    const h = harness();
    await h.client.getSnapshot();
    h.advance(3_541_000); // within 60-second safety skew
    await Promise.all([h.client.getSnapshot({ window: "7d" }), h.client.getSnapshot({ window: "90d" })]);
    const tokens = h.fetcher.mock.calls.filter(([u]) => oauth(String(u)));
    expect(tokens).toHaveLength(2);
    const lastCall = h.fetcher.mock.calls.at(-1)!;
    expect((lastCall[1]!.headers as Record<string, string>).Authorization).toBe("Bearer synthetic-token-2");
  });

  it("reauthenticates once on 401 without refreshing repeatedly across concurrent sources", async () => {
    let tokenCalls = 0;
    const h = harness((url, init) => {
      if (oauth(url)) return json({ access_token: `token${++tokenCalls}`, expires_in: 3600 });
      if ((init.headers as Record<string, string>).Authorization === "Bearer token1") return json({ error: { message: pem } }, 401);
      return json({ rows: [] });
    });
    expect((await h.client.getSnapshot()).status).toBe("success");
    expect(tokenCalls).toBe(2);
    expect(h.sleeps).toHaveLength(0);
  });

  it("stops after one reauthentication on persistent 401", async () => {
    let tokens = 0;
    const h = harness(url => oauth(url) ? json({ access_token: `token${++tokens}`, expires_in: 3600 }) : json({ error: "SECRET" }, 401));
    const result = await h.client.getSnapshot();
    expect(tokens).toBe(2);
    expect(result.status).toBe("error");
    expect(result.ga4).toEqual({ status: "error", error: { code: "AUTHENTICATION", httpStatus: 401, retryable: false } });
    expect(h.fetcher).toHaveBeenCalledTimes(8);
  });

  it.each([429, 500, 503])("caps Retry-After and retries %i at most twice", async status => {
    const h = harness(url => oauth(url) ? json({ access_token: "token", expires_in: 3600 }) : json({ error: { message: "SECRET" } }, status, { "Retry-After": "999999999" }));
    const result = await h.client.getSnapshot();
    expect(result.status).toBe("error");
    expect(h.sleeps).toEqual(Array(6).fill(5000));
    expect(h.fetcher).toHaveBeenCalledTimes(10);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("honors HTTP-date Retry-After with capped jitter/backoff", async () => {
    let attempts = 0;
    const h = harness(url => {
      if (oauth(url)) return json({ access_token: "token", expires_in: 3600 });
      if (url.endsWith("runReport") && attempts++ < 2) return json({}, 503, { "Retry-After": new Date(epoch + 2000).toUTCString() });
      return json({});
    });
    expect((await h.client.getSnapshot()).status).toBe("success");
    expect(h.sleeps).toEqual([2000, 2000]);
  });

  it("retries network failures with bounded exponential jitter and sanitizes thrown errors", async () => {
    const h = harness(url => { if (oauth(url)) return json({ access_token: "token", expires_in: 3600 }); throw new Error(`NETWORK_SECRET ${pem}`); });
    const result = await h.client.getSnapshot();
    expect(h.sleeps.sort((a, b) => a - b)).toEqual([375, 375, 375, 750, 750, 750]);
    expect(result.status).toBe("error");
    expect(result.ga4).toEqual({ status: "error", error: { code: "UPSTREAM_UNAVAILABLE", httpStatus: null, retryable: true } });
    expect(JSON.stringify(result)).not.toMatch(/NETWORK_SECRET|PRIVATE KEY/);
  });

  it.each(["forbidden", "dailyLimitExceeded", "insufficientPermissions"])("does not retry 403 %s or cache failures", async reason => {
    const h = harness(url => oauth(url) ? json({ access_token: "token", expires_in: 3600 }) : json({ error: { errors: [{ reason }], message: pem } }, 403));
    await h.client.getSnapshot();
    expect(h.fetcher).toHaveBeenCalledTimes(4);
    await h.client.getSnapshot();
    expect(h.fetcher).toHaveBeenCalledTimes(7);
    expect(h.sleeps).toEqual([]);
  });

  it("retries explicitly transient 403 quota reasons only", async () => {
    let count = 0;
    const h = harness(url => {
      if (oauth(url)) return json({ access_token: "token", expires_in: 3600 });
      if (url.includes("webmasters") && count++ === 0) return json({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }, 403);
      return json({});
    });
    expect((await h.client.getSnapshot()).status).toBe("success");
    expect(h.sleeps).toEqual([375]);
  });

  it("bounds hung fetches and aborts their signal, even if fetch ignores abort", async () => {
    vi.useFakeTimers();
    const h = harness(url => oauth(url) ? json({ access_token: "token", expires_in: 3600 }) : new Promise<Response>(() => {}));
    const pending = h.client.getSnapshot();
    await vi.advanceTimersByTimeAsync(24_010);
    const result = await pending;
    expect(result.status).toBe("error");
    expect(result.ga4).toEqual({ status: "error", error: { code: "TIMEOUT", httpStatus: null, retryable: true } });
    expect(h.fetcher).toHaveBeenCalledTimes(10);
    expect(h.fetcher.mock.calls.slice(1).every(([, init]) => init!.signal!.aborted)).toBe(true);
  });

  it("also bounds hung body reads", async () => {
    vi.useFakeTimers();
    const h = harness(url => oauth(url) ? json({ access_token: "token", expires_in: 3600 }) : new Response(new ReadableStream({ start() { /* never yields or closes */ } })));
    const pending = h.client.getSnapshot();
    await vi.advanceTimersByTimeAsync(24_010);
    expect((await pending).realtime).toMatchObject({ status: "error", error: { code: "TIMEOUT" } });
  });

  it("rejects oversized and malformed successful responses safely", async () => {
    const h = harness(url => oauth(url) ? json({ access_token: "token", expires_in: 3600 }) : new Response("x".repeat(512_001)));
    expect((await h.client.getSnapshot()).ga4).toEqual({ status: "error", error: { code: "INVALID_RESPONSE", httpStatus: null, retryable: false } });
    const malformed = harness(url => oauth(url) ? json({ access_token: "token", expires_in: 3600 }) : json({ rows: [{ dimensionValues: [{ value: "SECRET bad value" }], metricValues: [{ value: "NaN" }] }] }));
    expect((await malformed.client.getSnapshot()).status).toBe("error");
  });

  it.each([
    { GOOGLE_REPORTING_GA4_PROPERTY_ID: "559398176" },
    { GOOGLE_REPORTING_GSC_SITE_URL: "https://localpro.lt/" },
    { GOOGLE_REPORTING_CREDENTIALS_JSON: JSON.stringify({ ...credentials, project_id: "other" }) },
    { GOOGLE_REPORTING_CREDENTIALS_JSON: JSON.stringify({ ...credentials, client_email: "other@example.com" }) },
    { GOOGLE_REPORTING_CREDENTIALS_JSON: JSON.stringify({ ...credentials, type: "authorized_user" }) },
    { GOOGLE_REPORTING_CREDENTIALS_JSON: JSON.stringify({ ...credentials, private_key: "SECRET invalid pem" }) },
    { GOOGLE_REPORTING_CREDENTIALS_JSON: undefined }
  ])("rejects misconfiguration without any network calls or secret leakage", async override => {
    const fetcher = vi.fn();
    const client = createGoogleReportingClient({ env: { ...env, ...override }, fetch: fetcher });
    const result = await client.getSnapshot();
    expect(result.status).toBe("error");
    expect(result.ga4).toEqual({ status: "error", error: { code: "CONFIGURATION", httpStatus: null, retryable: false } });
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE KEY|client_email/);
  });

  it("does not confuse a 200 error envelope with valid empty rows", async () => {
    const h = harness(url => oauth(url) ? json({ access_token: "token", expires_in: 3600 }) : json({ error: { message: "SECRET" } }));
    const result = await h.client.getSnapshot();
    expect(result.status).toBe("error");
    expect(result.ga4).toEqual({ status: "error", error: { code: "INVALID_RESPONSE", httpStatus: 200, retryable: false } });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("bounds token-endpoint retries, sanitizes OAuth failures, and never calls reporting APIs without a token", async () => {
    const h = harness(() => json({ error: "invalid_grant", error_description: pem }, 503, { "Retry-After": "10" }));
    const result = await h.client.getSnapshot();
    expect(result.status).toBe("error");
    expect(h.fetcher).toHaveBeenCalledTimes(3);
    expect(h.fetcher.mock.calls.every(([url]) => oauth(String(url)))).toBe(true);
    expect(h.sleeps).toEqual([5000, 5000]);
    expect(JSON.stringify(result)).not.toMatch(/invalid_grant|PRIVATE KEY/);
  });

  it.each(["fetch", "body", "post-refresh fetch"])("shares one 45s deadline across token retries, reports and 401 renewal; aborts hung %s and retains successes", async stalled => {
    let tokens = 0;
    const cancel = vi.fn();
    const h = timedHarness((url, init) => {
      if (oauth(url)) {
        tokens++;
        if (tokens <= 2) return later(7000, json({ error: "SECRET" }, 503, { "Retry-After": "5" }));
        if (tokens === 3) return later(7000, json({ access_token: "token", expires_in: 3600 }));
        if (stalled === "post-refresh fetch") return later(6000, json({ access_token: "refreshed", expires_in: 3600 }));
        return stalled === "fetch" ? new Promise<Response>(() => {}) : new Response(new ReadableStream({ cancel }));
      }
      if ((init.headers as Record<string, string>).Authorization === "Bearer refreshed") return new Promise<Response>(() => {});
      if (url.endsWith("runRealtimeReport") || url.includes("webmasters")) return json({});
      return later(7000, json({ error: "SECRET" }, 401));
    });
    let settled = false;
    const pending = h.client.getSnapshot({ includeConversions: true }).then(result => { settled = true; return result; });
    await vi.advanceTimersByTimeAsync(44_999);
    expect(settled).toBe(false);
    expect(tokens).toBe(4); // one shared renewal, not one per 401 source
    const active = h.fetcher.mock.calls.at(-1)![1]!.signal!;
    expect(active.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(Date.now()).toBe(epoch + 45_000);
    expect(result.status).toBe("partial");
    expect(result.ga4).toEqual(timeoutResult);
    expect(result.conversions).toEqual(timeoutResult);
    expect(result.realtime.status).toBe("success");
    expect(result.searchConsole.status).toBe("success");
    expect(active.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(stalled === "body" ? 1 : 0);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(vi.getTimerCount()).toBe(0);
    const calls = h.fetcher.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100_000);
    expect(h.fetcher).toHaveBeenCalledTimes(calls);
    // Timeout failures are not cached; successful per-source caches are intact.
    h.fetcher.mockImplementation(async () => json({ access_token: "fresh", expires_in: 3600, rows: [] }));
    const next = await h.client.getSnapshot();
    expect(next.status).toBe("success");
    expect(next.searchConsole).toEqual(result.searchConsole);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["attempt", "body", "backoff"])("limits reporting %s to the budget left after OAuth, without later retries", async stage => {
    let tokens = 0;
    const cancel = vi.fn();
    const lateResponses: ((response: Response) => void)[] = [];
    const attempts = new Map<string, number>();
    const h = timedHarness(url => {
      if (oauth(url)) return later(7000, ++tokens < 3 ? json({}, 503, { "Retry-After": "5" }) : json({ access_token: "token", expires_in: 3600 }));
      const n = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, n);
      if (n === 1) return later(7000, json({}, 503, { "Retry-After": "5" }));
      if (stage === "attempt") return new Promise<Response>(resolve => { lateResponses.push(resolve); });
      if (stage === "body") return new Response(new ReadableStream({ cancel }));
      return json({}, 503, { "Retry-After": "5" });
    });
    const pending = h.client.getSnapshot();
    await vi.advanceTimersByTimeAsync(45_000);
    const result = await pending;
    expect(result.ga4).toEqual(timeoutResult);
    expect(result.realtime).toEqual(timeoutResult);
    expect(result.searchConsole).toEqual(timeoutResult);
    expect([...attempts.values()]).toEqual([2, 2, 2]);
    if (stage !== "backoff") expect(h.fetcher.mock.calls.slice(-3).every(([, init]) => init!.signal!.aborted)).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(stage === "body" ? 3 : 0);
    expect(vi.getTimerCount()).toBe(0);
    // Even an abort-ignoring transport that resolves later cannot start a body read or retry.
    for (const resolve of lateResponses) resolve(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(60_000);
    expect([...attempts.values()]).toEqual([2, 2, 2]);
    expect(cancel).toHaveBeenCalledTimes(stage === "backoff" ? 0 : 3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds an older snapshot waiting on a newer snapshot's shared renewal without cancelling its work", async () => {
    let tokens = 0;
    const counts = new Map<string, number>();
    const h = timedHarness((url, init) => {
      if (oauth(url)) {
        tokens++;
        if (tokens === 1) return later(7000, json({ access_token: "old", expires_in: 3600 }));
        return later(7000, tokens < 4 ? json({}, 503, { "Retry-After": "5" }) : json({ access_token: "new", expires_in: 3600 }));
      }
      const body = JSON.parse(init.body as string);
      const newer = body.dateRanges?.[0].startDate === "2026-10-10" || body.startDate === "2026-10-08";
      if ((init.headers as Record<string, string>).Authorization === "Bearer new") return json({});
      if (newer) return json({}, 401); // owns renewal from t=35s until t=66s
      const n = (counts.get(url) ?? 0) + 1;
      counts.set(url, n);
      return later(7000, json({}, n < 3 ? 503 : 401, { "Retry-After": "5" }));
    });
    const older = h.client.getSnapshot();
    await vi.advanceTimersByTimeAsync(35_000);
    const newer = h.client.getSnapshot({ window: "7d" });
    const coalesced = h.client.getSnapshot({ window: "7d" });
    await vi.advanceTimersByTimeAsync(10_000);
    const oldResult = await older;
    expect(oldResult.ga4).toEqual(timeoutResult);
    expect(oldResult.realtime).toEqual(timeoutResult);
    expect(oldResult.searchConsole).toEqual(timeoutResult);
    expect(Date.now()).toBe(epoch + 45_000);
    // The renewal belongs to the newer snapshot and remains live after the older wait expires.
    expect(h.fetcher.mock.calls.filter(([url]) => oauth(String(url)))).toHaveLength(2);
    expect(h.fetcher.mock.calls.findLast(([url]) => oauth(String(url)))![1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(21_000);
    const [newResult, joinedResult] = await Promise.all([newer, coalesced]);
    expect(newResult.status).toBe("partial"); // realtime was coalesced with the older owner's work
    expect(newResult.ga4.status).toBe("success");
    expect(newResult.searchConsole.status).toBe("success");
    expect(newResult.realtime).toEqual(timeoutResult);
    expect(joinedResult).toEqual(newResult);
    expect(tokens).toBe(4);
    expect(vi.getTimerCount()).toBe(0);
    expect((await h.client.getSnapshot({ window: "7d" })).status).toBe("success");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["invalid_grant", "invalid_client"])("classifies OAuth 400 %s as sanitized authentication, not a reporting request error", async error => {
    const h = harness(() => json({ error, error_description: `SECRET ${pem}` }, 400));
    const result = await h.client.getSnapshot({ includeConversions: true });
    const failure = { status: "error", error: { code: "AUTHENTICATION", httpStatus: 400, retryable: false } };
    expect([result.ga4, result.realtime, result.searchConsole, result.conversions]).toEqual(Array(4).fill(failure));
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    expect(h.sleeps).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE KEY|invalid_grant|invalid_client/);
    const reporting = harness(url => oauth(url) ? json({ access_token: "token", expires_in: 3600 }) : json({ error: "SECRET" }, 400));
    expect((await reporting.client.getSnapshot()).ga4).toEqual({ status: "error", error: { code: "INVALID_REQUEST", httpStatus: 400, retryable: false } });
    expect(reporting.fetcher).toHaveBeenCalledTimes(4);
    expect(reporting.sleeps).toEqual([]);
  });

  it("rejects arbitrary date windows before any network call", async () => {
    const h = harness();
    await expect(h.client.getSnapshot({ window: "all" as "7d" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(sanitizeReportingError(new Error(pem))).toEqual({ code: "UPSTREAM_UNAVAILABLE", httpStatus: null, retryable: false });
    expect(JSON.stringify(new GoogleReportingError("FORBIDDEN", 403))).toBe('{"code":"FORBIDDEN","httpStatus":403,"retryable":false}');
  });
});
