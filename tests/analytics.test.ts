import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

type Analytics = typeof import("../lib/analytics");
let analytics: Analytics;
let listener: (event: unknown) => void;
let posted: unknown[];
let storage: Map<string, string>;
let frames: Array<{ contentWindow: { postMessage: ReturnType<typeof vi.fn> }; remove: ReturnType<typeof vi.fn>; setAttribute: ReturnType<typeof vi.fn> }>;
let cookieWrites: string[];

beforeEach(async () => {
  vi.resetModules();
  posted = [];
  frames = [];
  storage = new Map();
  cookieWrites = [];
  vi.stubGlobal("window", {
    location: { hostname: "localpro.lt", origin: "https://localpro.lt", protocol: "https:" },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    addEventListener: (_: string, callback: typeof listener) => { listener = callback; },
    removeEventListener: vi.fn()
  });
  vi.stubGlobal("document", {
    documentElement: { dataset: {} },
    get cookie() { return "_ga=test; _ga_DE7XEQRBJC=test; session=preserve"; },
    set cookie(value: string) { cookieWrites.push(value); },
    createElement: () => {
      const frame = { contentWindow: { postMessage: vi.fn((event) => posted.push(event)) }, remove: vi.fn(), setAttribute: vi.fn() };
      frames.push(frame);
      return frame;
    },
    body: { appendChild: vi.fn() }
  });
  analytics = await import("../lib/analytics");
});
afterEach(() => vi.unstubAllGlobals());
function ready() { listener({ source: frames.at(-1)?.contentWindow, origin: "https://localpro.lt", data: { type: "localpro:analytics-ready" } }); }
function accept() { analytics.setAnalyticsConsent("accepted"); ready(); }

describe("actual consent and analytics controller", () => {
  it("does not load Google, set cookies or queue retrospective conversions before opt-in", () => {
    analytics.trackPage("/request?email=private@example.lt");
    analytics.trackContact("phone");
    analytics.trackConfirmedConversion("enquiry", { ok: true }, { ok: true, requestId: "private-request" });
    expect(frames).toHaveLength(0);
    expect(posted).toEqual([]);
    expect(cookieWrites).toEqual([]);
    accept();
    analytics.trackConfirmedConversion("enquiry", { ok: true }, { ok: true, requestId: "private-request" });
    expect(posted).toEqual([]);
  });
  it("persists explicit choice, fails closed on invalid/unavailable storage", () => {
    expect(analytics.readAnalyticsConsent()).toBeNull();
    storage.set(analytics.CONSENT_KEY, "true");
    expect(analytics.readAnalyticsConsent()).toBeNull();
    analytics.setAnalyticsConsent("rejected");
    expect(analytics.readAnalyticsConsent()).toBe("rejected");
    window.localStorage.getItem = () => { throw new Error("storage denied"); };
    expect(analytics.readAnalyticsConsent()).toBeNull();
  });
  it("installs once, deduplicates manual page views and strips personal routes/query/hash", () => {
    accept();
    analytics.setAnalyticsConsent("accepted");
    analytics.trackPage("/meistrai/private-name?email=private@example.lt#phone");
    analytics.trackPage("/meistrai/private-name?address=secret");
    analytics.trackPage("/request?email=secret#private");
    analytics.trackPage("/request");
    analytics.trackPage("/");
    expect(frames).toHaveLength(1);
    expect(posted).toEqual([
      { type: "localpro:analytics", name: "page_view", params: { page_location: "https://localpro.lt/meistrai/profile", page_title: "LocalPro.lt", page_referrer: "" } },
      { type: "localpro:analytics", name: "page_view", params: { page_location: "https://localpro.lt/request", page_title: "LocalPro.lt", page_referrer: "" } },
      { type: "localpro:analytics", name: "page_view", params: { page_location: "https://localpro.lt/", page_title: "LocalPro.lt", page_referrer: "" } }
    ]);
    expect(analytics.analyticsPath("/some-private-name/some-address?q=secret")).toBe("/other");
    expect(analytics.analyticsPath("/specialist/private-id")).toBe("/meistrai/profile");
  });
  it("only sends completed persisted conversions once; contact clicks never become leads", () => {
    accept();
    for (const data of [{}, { ok: true }, { ok: false, requestId: "a" }, { ok: true, requestId: "a", mode: "seed" }]) {
      analytics.trackConfirmedConversion("enquiry", { ok: true }, data);
    }
    analytics.trackConfirmedConversion("enquiry", { ok: false }, { ok: true, requestId: "a" });
    analytics.trackContact("phone");
    analytics.trackContact("email");
    analytics.trackConfirmedConversion("enquiry", { ok: true }, { ok: true, requestId: "a", email: "private@example.lt" });
    analytics.trackConfirmedConversion("enquiry", { ok: true }, { ok: true, requestId: "a" });
    analytics.trackConfirmedConversion("registration", { ok: true }, { ok: true, profile: { id: "b", name: "Private" } });
    analytics.trackConfirmedConversion("registration", { ok: true }, { ok: true, profile: { id: "b" } });
    expect(posted).toEqual([
      { type: "localpro:analytics", name: "contact_click", params: { contact_method: "phone" } },
      { type: "localpro:analytics", name: "contact_click", params: { contact_method: "email" } },
      { type: "localpro:analytics", name: "generate_lead", params: { method: "job_request" } },
      { type: "localpro:analytics", name: "sign_up", params: { method: "specialist_registration" } }
    ]);
  });
  it("revocation destroys the Google context, drops queued events, clears only GA cookies and stops sends", () => {
    analytics.setAnalyticsConsent("accepted");
    analytics.trackPage("/");
    const old = frames[0];
    analytics.setAnalyticsConsent("rejected");
    expect(old.remove).toHaveBeenCalledOnce();
    ready();
    analytics.trackContact("phone");
    analytics.trackPage("/request");
    expect(posted).toEqual([]);
    expect(cookieWrites.length).toBeGreaterThan(0);
    expect(cookieWrites.every((cookie) => cookie.startsWith("_ga"))).toBe(true);
    expect(storage.get(analytics.CONSENT_KEY)).toBe("rejected");
    accept();
    analytics.trackPage("/");
    expect(posted).toHaveLength(1);
  });
  it("tracks through the real enquiry submission boundary, not errors, malformed responses or demo data", async () => {
    accept();
    const { submitEnquiry } = await import("../lib/client-enquiry");
    const payload = { clientEmail: "private@example.lt", description: "Private message", address: "Private address" };
    const fail = vi.fn(async () => new Response(JSON.stringify({ error: "Server failure" }), { status: 500 }));
    await expect(submitEnquiry(payload, fail)).rejects.toThrow("Server failure");
    await expect(submitEnquiry(payload, vi.fn(async () => new Response("not json")))).rejects.toThrow();
    await expect(submitEnquiry(payload, vi.fn(async () => Response.json({ ok: true })))).rejects.toThrow();
    await submitEnquiry(payload, vi.fn(async () => Response.json({ ok: true, mode: "seed", requestId: "demo" })));
    expect(posted).toEqual([]);
    const fetcher = vi.fn(async () => Response.json({ ok: true, requestId: "persisted" }, { status: 201 }));
    await submitEnquiry(payload, fetcher);
    await submitEnquiry(payload, fetcher);
    expect(fetcher).toHaveBeenCalledWith("/api/job-requests", expect.objectContaining({ method: "POST", body: JSON.stringify(payload) }));
    expect(posted).toEqual([{ type: "localpro:analytics", name: "generate_lead", params: { method: "job_request" } }]);
  });
  it("tracks through the real registration submit helper only after a new successful response", async () => {
    accept();
    const { submitRegistrationDraft } = await import("../components/LocalProApp");
    const draft = { address: "Vilnius", town: "Vilnius", phone: "063601230", categorySlugs: ["apdaila"], photoUrls: [], photoUploads: [] } as unknown as import("../components/LocalProApp").RegistrationDraft;
    for (const [ok, data] of [
      [false, { error: "failed" }],
      [true, { ok: true, existingProfile: true, profile: { id: "old" } }],
      [true, { ok: true, mode: "seed", profile: { id: "demo" } }],
      [true, { ok: true, profile: { id: "new" } }],
      [true, { ok: true, profile: { id: "new" } }]
    ] as const) {
      await submitRegistrationDraft(draft, { googlePlacesApiKeyConfigured: false, fetcher: vi.fn(async () => ({ ok, json: async () => data }) as Response) });
    }
    expect(posted).toEqual([{ type: "localpro:analytics", name: "sign_up", params: { method: "specialist_registration" } }]);
  });
  it("rejects forged frame readiness and excludes other sites/previews", () => {
    analytics.setAnalyticsConsent("accepted");
    analytics.trackPage("/");
    listener({ source: {}, origin: "https://localpro.lt", data: { type: "localpro:analytics-ready" } });
    expect(posted).toEqual([]);
    analytics.setAnalyticsConsent("rejected");
    Object.assign(window.location, { hostname: "leonamai.lt", origin: "https://leonamai.lt" });
    analytics.setAnalyticsConsent("accepted");
    expect(frames).toHaveLength(1);
    expect(analytics.GA4_ID).toBe("G-DE7XEQRBJC");
  });
});

describe("actual isolated Google frame script", () => {
  it("executes real frame script with manual views only and a constant-only event boundary", () => {
    const html = readFileSync(new URL("../public/localpro-analytics.html", import.meta.url), "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    let handler: (event: unknown) => void = () => {};
    const append = vi.fn();
    const parent = { postMessage: vi.fn(), location: { origin: "https://localpro.lt" } };
    const frameWindow = { parent, dataLayer: [] as unknown[][], addEventListener: (_: string, callback: typeof handler) => { handler = callback; } };
    vm.runInNewContext(script, { window: frameWindow, location: { protocol: "https:", hostname: "localpro.lt", origin: "https://localpro.lt" }, document: { createElement: () => ({}), head: { appendChild: append } } });
    const commands = () => frameWindow.dataLayer.map((args) => Array.from(args));
    expect(append).toHaveBeenCalledOnce();
    expect(append.mock.calls[0][0].src).toBe("https://www.googletagmanager.com/gtag/js?id=G-DE7XEQRBJC");
    expect(commands().find((args) => args[0] === "config")).toEqual(["config", "G-DE7XEQRBJC", expect.objectContaining({ send_page_view: false, page_location: "https://localpro.lt/", page_title: "LocalPro.lt", page_referrer: "", allow_google_signals: false })]);
    function send(name: string, params: object, source = parent) { handler({ source, origin: "https://localpro.lt", data: { type: "localpro:analytics", name, params } }); }
    send("page_view", { page_location: "https://localpro.lt/private-name?email=secret" });
    send("custom_pii", { email: "secret" });
    send("generate_lead", { email: "secret" }, {} as typeof parent);
    expect(commands().filter((args) => args[0] === "event")).toHaveLength(0);
    send("page_view", { page_location: "https://localpro.lt/request", page_title: "Private", page_referrer: "https://secret", email: "secret" });
    send("generate_lead", { email: "secret" });
    send("contact_click", { contact_method: "email", email: "secret" });
    expect(commands().filter((args) => args[0] === "event")).toEqual([
      ["event", "page_view", { send_to: "G-DE7XEQRBJC", page_location: "https://localpro.lt/request", page_title: "LocalPro.lt", page_referrer: "" }],
      ["event", "generate_lead", { send_to: "G-DE7XEQRBJC", method: "job_request" }],
      ["event", "contact_click", { send_to: "G-DE7XEQRBJC", contact_method: "email" }]
    ]);
  });
});
