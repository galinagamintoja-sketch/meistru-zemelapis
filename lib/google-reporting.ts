import "server-only";
import { createPrivateKey, sign } from "node:crypto";

// Intentionally not a general Google API proxy. Only fixed aggregate reports leave this module.
const OAUTH_URL = "https://oauth2.googleapis.com/token";
const GA_URL = "https://analyticsdata.googleapis.com/v1beta/properties/559398175:";
const GSC_URL = "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Alocalpro.lt/searchAnalytics/query";
const EMAIL = "localpro-analytics-reader@localpro-501816.iam.gserviceaccount.com";
const SCOPES = "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly";
const CONVERSIONS = ["generate_lead", "sign_up", "contact_click"] as const;
const TIMEOUT_MS = 8_000;
const MAX_DELAY_MS = 5_000;
const MAX_RETRIES = 2;
const MAX_BODY_BYTES = 512_000;

export type ReportingErrorCode = "CONFIGURATION" | "AUTHENTICATION" | "FORBIDDEN" | "QUOTA" | "UPSTREAM_UNAVAILABLE" | "TIMEOUT" | "INVALID_RESPONSE" | "INVALID_REQUEST";
export type ReportingFailure = { code: ReportingErrorCode; httpStatus: number | null; retryable: boolean };
export class GoogleReportingError extends Error {
  readonly code: ReportingErrorCode;
  readonly httpStatus: number | null;
  readonly retryable: boolean;
  constructor(code: ReportingErrorCode, httpStatus: number | null = null, retryable = false) {
    super(`Google reporting: ${code}`);
    this.name = "GoogleReportingError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
  toJSON(): ReportingFailure { return { code: this.code, httpStatus: this.httpStatus, retryable: this.retryable }; }
}
export function sanitizeReportingError(error: unknown): ReportingFailure {
  return error instanceof GoogleReportingError ? error.toJSON() : { code: "UPSTREAM_UNAVAILABLE", httpStatus: null, retryable: false };
}
export type ReportingWindow = "7d" | "28d" | "90d";
export type ReportResult<T> =
  | { status: "success"; empty: boolean; data: T; fetchedAt: string }
  | { status: "error"; error: ReportingFailure };
export type PropertyQuota = Record<string, { consumed?: number; remaining?: number }>;
export type GaDailyReport = { rows: { date: string; activeUsers: number; sessions: number; eventCount: number }[]; quota: PropertyQuota };
export type GaEventReport = { rows: { eventName: string; eventCount: number }[]; quota: PropertyQuota };
export type SearchDailyReport = { rows: { date: string; clicks: number; impressions: number; ctr: number; position: number }[] };
export type GoogleReportingSnapshot = {
  status: "success" | "partial" | "error";
  window: ReportingWindow;
  ga4: ReportResult<GaDailyReport>;
  realtime: ReportResult<GaEventReport>;
  searchConsole: ReportResult<SearchDailyReport>;
  conversions?: ReportResult<GaEventReport>;
};

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GoogleReportingError("INVALID_RESPONSE");
  return value as Json;
}
function number(value: unknown): number {
  if ((typeof value !== "string" && typeof value !== "number") || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0) throw new GoogleReportingError("INVALID_RESPONSE");
  return Number(value);
}
function array(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new GoogleReportingError("INVALID_RESPONSE");
  return value;
}
function quota(value: unknown): PropertyQuota {
  if (value === undefined) return {};
  const source = object(value);
  const result: PropertyQuota = {};
  for (const key of ["tokensPerDay", "tokensPerHour", "concurrentRequests", "serverErrorsPerProjectPerHour", "potentiallyThresholdedRequestsPerHour", "tokensPerProjectPerHour"]) {
    if (source[key] !== undefined) {
      const item = object(source[key]);
      result[key] = {};
      if (item.consumed !== undefined) result[key].consumed = number(item.consumed);
      if (item.remaining !== undefined) result[key].remaining = number(item.remaining);
    }
  }
  return result;
}
function gaRows(body: Json, event: boolean, conversions = false): GaDailyReport | GaEventReport {
  const rows = array(body.rows).map(raw => {
    const row = object(raw);
    const dimension = object(array(row.dimensionValues)[0]).value;
    const metrics = array(row.metricValues).map(v => number(object(v).value));
    if (typeof dimension !== "string") throw new GoogleReportingError("INVALID_RESPONSE");
    if (event) {
      // Event names are aggregate categories, never query/page/user dimensions.
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(dimension) || metrics.length !== 1 || (conversions && !CONVERSIONS.includes(dimension as typeof CONVERSIONS[number]))) throw new GoogleReportingError("INVALID_RESPONSE");
      return { eventName: dimension, eventCount: metrics[0] };
    }
    if (!/^\d{8}$/.test(dimension) || metrics.length !== 3) throw new GoogleReportingError("INVALID_RESPONSE");
    return { date: `${dimension.slice(0, 4)}-${dimension.slice(4, 6)}-${dimension.slice(6, 8)}`, activeUsers: metrics[0], sessions: metrics[1], eventCount: metrics[2] };
  });
  return { rows, quota: quota(body.propertyQuota) } as GaDailyReport | GaEventReport;
}
function searchRows(body: Json): SearchDailyReport {
  return { rows: array(body.rows).map(raw => {
    const row = object(raw);
    const keys = array(row.keys);
    if (keys.length !== 1 || typeof keys[0] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(keys[0])) throw new GoogleReportingError("INVALID_RESPONSE");
    return { date: keys[0], clicks: number(row.clicks), impressions: number(row.impressions), ctr: number(row.ctr), position: number(row.position) };
  }) };
}

/** Dependency injection is for trusted server tests only; never pass user input as dependencies. */
type Dependencies = {
  fetch?: typeof fetch;
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};
export function createGoogleReportingClient(deps: Dependencies = {}) {
  const fetcher = deps.fetch ?? fetch;
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const random = deps.random ?? Math.random;
  let credentials: { email: string; key: ReturnType<typeof createPrivateKey> } | undefined;
  let token: { value: string; expiresAt: number } | undefined;
  let refreshing: Promise<string> | undefined;
  const cache = new Map<string, { expires: number; value: ReportResult<unknown> }>();
  const inflight = new Map<string, Promise<ReportResult<unknown>>>();

  function getCredentials() {
    if (credentials) return credentials;
    try {
      // Never read public env or trust token_uri/project supplied by a request.
      if (env.GOOGLE_REPORTING_GA4_PROPERTY_ID !== "559398175" || env.GOOGLE_REPORTING_GSC_SITE_URL !== "sc-domain:localpro.lt") throw new Error();
      const raw = JSON.parse(env.GOOGLE_REPORTING_CREDENTIALS_JSON ?? "");
      if (raw.type !== "service_account" || raw.project_id !== "localpro-501816" || raw.client_email !== EMAIL || typeof raw.private_key !== "string") throw new Error();
      const key = createPrivateKey(raw.private_key);
      if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
      credentials = { email: raw.client_email, key };
      return credentials;
    } catch { throw new GoogleReportingError("CONFIGURATION"); }
  }

  async function attempt(url: string, init: RequestInit): Promise<{ status: number; body: unknown; retryAfter: string | null }> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(url, { ...init, signal: controller.signal, redirect: "error", cache: "no-store" });
          // Bound response reads, including error bodies; nothing raw crosses the client boundary.
          let text = "";
          let size = 0;
          if (response.body) {
            const reader = response.body.getReader();
            activeReader = reader;
            const decoder = new TextDecoder();
            try {
              for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > MAX_BODY_BYTES) { void reader.cancel().catch(() => {}); throw new GoogleReportingError("INVALID_RESPONSE"); }
                text += decoder.decode(value, { stream: true });
              }
              text += decoder.decode();
            } finally { reader.releaseLock(); activeReader = undefined; }
          }
          let body: unknown;
          try { body = JSON.parse(text); } catch {
            if (response.ok) throw new GoogleReportingError("INVALID_RESPONSE", response.status);
            body = {};
          }
          return { status: response.status, body, retryAfter: response.headers.get("retry-after") };
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new GoogleReportingError("TIMEOUT", null, true));
            controller.abort();
            void activeReader?.cancel().catch(() => {});
          }, TIMEOUT_MS);
        })
      ]);
    } catch (error) {
      if (error instanceof GoogleReportingError) throw error;
      throw new GoogleReportingError("UPSTREAM_UNAVAILABLE", null, true);
    } finally { if (timer) clearTimeout(timer); }
  }

  function failure(status: number, body: unknown): GoogleReportingError {
    let quotaReason = false;
    if (status === 403 && body && typeof body === "object") {
      // Only explicit transient quota reasons; daily limits/permissions are not retried.
      const error = (body as Json).error;
      if (error && typeof error === "object") {
        const e = error as Json;
        const items = [...(Array.isArray(e.errors) ? e.errors : []), ...(Array.isArray(e.details) ? e.details : [])];
        quotaReason = items.some(item => item && typeof item === "object" && ["rateLimitExceeded", "userRateLimitExceeded", "RATE_LIMIT_EXCEEDED"].includes((item as Json).reason as string));
      }
    }
    if (status === 401) return new GoogleReportingError("AUTHENTICATION", status);
    if (status === 429 || quotaReason) return new GoogleReportingError("QUOTA", status, true);
    if (status === 403) return new GoogleReportingError("FORBIDDEN", status);
    return new GoogleReportingError(status >= 500 ? "UPSTREAM_UNAVAILABLE" : "INVALID_REQUEST", status, status >= 500 && status <= 599);
  }
  async function request(url: string, init: RequestInit): Promise<Json> {
    for (let retry = 0; ; retry++) {
      let retryAfter: string | null = null;
      try {
        const result = await attempt(url, init);
        retryAfter = result.retryAfter;
        if (result.status < 200 || result.status >= 300) throw failure(result.status, result.body);
        return object(result.body);
      } catch (error) {
        const safe = error instanceof GoogleReportingError ? error : new GoogleReportingError("UPSTREAM_UNAVAILABLE", null, true);
        if (!safe.retryable || retry >= MAX_RETRIES) throw safe;
        const parsed = retryAfter === null ? NaN : /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now();
        const backoff = Math.min(MAX_DELAY_MS, 250 * 2 ** retry * (0.5 + Math.max(0, Math.min(1, random()))));
        await sleep(Math.min(MAX_DELAY_MS, Math.max(backoff, Number.isFinite(parsed) ? parsed : 0)));
      }
    }
  }
  async function accessToken(): Promise<string> {
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const creds = getCredentials();
      const issuedAt = Math.floor(now() / 1000);
      let assertion: string;
      try {
        const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
        const payload = Buffer.from(JSON.stringify({ iss: creds.email, scope: SCOPES, aud: OAUTH_URL, iat: issuedAt, exp: issuedAt + 3600 })).toString("base64url");
        const unsigned = `${header}.${payload}`;
        assertion = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), creds.key).toString("base64url")}`;
      } catch { throw new GoogleReportingError("CONFIGURATION"); }
      // Anchor expiry before the network call, not afterwards.
      const started = now();
      const body = await request(OAUTH_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString() });
      if (typeof body.access_token !== "string" || !/^[\x21-\x7e]{1,8192}$/.test(body.access_token) || typeof body.expires_in !== "number" || body.expires_in <= 60 || body.expires_in > 3600 || (body.token_type !== undefined && body.token_type !== "Bearer")) throw new GoogleReportingError("INVALID_RESPONSE");
      token = { value: body.access_token, expiresAt: started + body.expires_in * 1000 };
      return token.value;
    })();
    try { return await refreshing; } finally { refreshing = undefined; }
  }
  async function api(url: string, body: Json): Promise<Json> {
    for (let authAttempt = 0; ; authAttempt++) {
      const usedToken = await accessToken();
      try {
        const result = await request(url, { method: "POST", headers: { Authorization: `Bearer ${usedToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if ("error" in result) throw new GoogleReportingError("INVALID_RESPONSE", 200);
        return result;
      } catch (error) {
        if (!(error instanceof GoogleReportingError) || error.httpStatus !== 401 || authAttempt >= 1) throw error;
        // Do not invalidate a newer token already refreshed by a concurrent report.
        if (token?.value === usedToken) token = undefined;
      }
    }
  }
  async function cached<T extends { rows: unknown[] }>(key: string, ttl: number, load: () => Promise<T>): Promise<ReportResult<T>> {
    // Prevent expired date-window entries accumulating on long-lived Node hosts.
    for (const [cachedKey, entry] of cache) if (entry.expires <= now()) cache.delete(cachedKey);
    const existing = cache.get(key);
    if (existing && existing.expires > now()) return structuredClone(existing.value) as ReportResult<T>;
    const current = inflight.get(key);
    if (current) return structuredClone(await current) as ReportResult<T>;
    const promise = (async (): Promise<ReportResult<T>> => {
      try {
        const data = await load();
        const result: ReportResult<T> = { status: "success", empty: data.rows.length === 0, data, fetchedAt: new Date(now()).toISOString() };
        cache.set(key, { expires: now() + ttl, value: result });
        return result;
      } catch (error) { return { status: "error", error: sanitizeReportingError(error) }; }
    })();
    inflight.set(key, promise);
    try { return structuredClone(await promise); } finally { inflight.delete(key); }
  }
  function dates(days: number, lag: number) {
    const end = new Date(now());
    end.setUTCDate(end.getUTCDate() - lag);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }
  return {
    async getSnapshot(options: { window?: ReportingWindow; includeConversions?: boolean } = {}): Promise<GoogleReportingSnapshot> {
      const window = options.window ?? "28d";
      if (!["7d", "28d", "90d"].includes(window) || (options.includeConversions !== undefined && typeof options.includeConversions !== "boolean")) throw new GoogleReportingError("INVALID_REQUEST");
      const days = window === "7d" ? 7 : window === "28d" ? 28 : 90;
      const daily = dates(days, 1);
      // Search Console is delayed; use complete/final data ending three UTC days ago.
      const search = dates(days, 3);
      const [ga4, realtime, searchConsole, conversions] = await Promise.all([
        cached(`ga:${daily.startDate}:${daily.endDate}`, 300_000, async () => gaRows(await api(`${GA_URL}runReport`, { dateRanges: [daily], dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "eventCount" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 90, returnPropertyQuota: true }), false) as GaDailyReport),
        cached("realtime", 30_000, async () => gaRows(await api(`${GA_URL}runRealtimeReport`, { dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], limit: 100, returnPropertyQuota: true }), true) as GaEventReport),
        cached(`gsc:${search.startDate}:${search.endDate}`, 900_000, async () => searchRows(await api(GSC_URL, { ...search, dimensions: ["date"], type: "web", dataState: "final", rowLimit: 90 }))),
        options.includeConversions ? cached(`conversions:${daily.startDate}:${daily.endDate}`, 300_000, async () => gaRows(await api(`${GA_URL}runReport`, { dateRanges: [daily], dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }], dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: [...CONVERSIONS], caseSensitive: true } } }, limit: 3, returnPropertyQuota: true }), true, true) as GaEventReport) : undefined
      ]);
      const sources = [ga4, realtime, searchConsole, ...(conversions ? [conversions] : [])];
      const successes = sources.filter(s => s.status === "success").length;
      return { status: successes === sources.length ? "success" : successes === 0 ? "error" : "partial", window, ga4, realtime, searchConsole, ...(conversions ? { conversions } : {}) };
    }
  };
}

// Per warm Node instance only, not shared/durable/serverless-global. Never caches failures.
let defaultClient: ReturnType<typeof createGoogleReportingClient> | undefined;
export function getGoogleReportingSnapshot(options?: { window?: ReportingWindow; includeConversions?: boolean }) {
  defaultClient ??= createGoogleReportingClient();
  return defaultClient.getSnapshot(options);
}
