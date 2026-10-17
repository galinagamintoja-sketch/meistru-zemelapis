// Only LocalPro's production hosts may send analytics. No preview/other-brand traffic.
export const GA4_ID = "G-DE7XEQRBJC";
export const CONSENT_KEY = "localpro.analytics-consent.v1";
export type AnalyticsConsent = "accepted" | "rejected";
type FrameEvent = { name: "page_view" | "generate_lead" | "sign_up" | "contact_click"; params: Record<string, string> };

// Never return input strings: even unknown/private routes collapse to a constant.
export function analyticsPath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0];
  if (pathname === "/") return "/";
  if (/^\/(meistrai|specialist)\//.test(pathname)) return "/meistrai/profile";
  const publicPaths = ["/request", "/meistro-registracija", "/login", "/privacy", "/terms", "/darbu-skelbimai"];
  if (publicPaths.includes(pathname)) return pathname;
  if (/^\/meistras(?:\/|$)/.test(pathname)) return "/meistras";
  if (/^\/admin(?:\/|$)/.test(pathname)) return "/admin";
  return "/other";
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "accepted" || value === "rejected" ? value : null;
  } catch { return null; }
}

let allowed = false;
let frame: HTMLIFrameElement | null = null;
let ready = false;
let pending: FrameEvent[] = [];
let lastPath: string | null = null;
const completed = new Set<string>(); // Internal dedupe only; IDs are NEVER sent/stored.

function emit(event: FrameEvent) {
  if (!allowed || !frame) return;
  if (!ready) { pending.push(event); return; }
  frame.contentWindow?.postMessage({ type: "localpro:analytics", ...event }, window.location.origin);
}

function receive(event: MessageEvent) {
  if (!allowed || !frame || event.source !== frame.contentWindow || event.origin !== window.location.origin || event.data?.type !== "localpro:analytics-ready") return;
  ready = true;
  const events = pending;
  pending = [];
  events.forEach(emit);
}

function removeAnalyticsCookies() {
  // Only GA cookies, never application/authentication cookies.
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=", 1)[0].trim();
    if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) continue;
    for (const domain of ["", "; Domain=localpro.lt", "; Domain=.localpro.lt", `; Domain=${window.location.hostname}`]) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax`;
    }
  }
}

export function setAnalyticsConsent(choice: AnalyticsConsent, persist = true) {
  if (typeof window === "undefined") return;
  if (persist) {
    try { window.localStorage.setItem(CONSENT_KEY, choice); } catch { /* In-memory consent still works. */ }
  }
  if (choice !== "accepted") {
    allowed = false;
    pending = [];
    ready = false;
    lastPath = null;
    // Disable synchronously before unload: removing a frame alone can trigger an engagement beacon.
    const context = frame?.contentWindow;
    if (context) {
      (context as unknown as Record<string, unknown>)[`ga-disable-${GA4_ID}`] = true;
      context.stop?.();
    }
    // Destroy the entire Google execution context: no timers/listeners remain after revocation.
    frame?.remove();
    frame = null;
    window.removeEventListener("message", receive);
    removeAnalyticsCookies();
    return;
  }
  if (!["localpro.lt", "www.localpro.lt"].includes(window.location.hostname) || window.location.protocol !== "https:") return;
  allowed = true;
  if (frame) return;
  frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "LocalPro statistika";
  frame.setAttribute("aria-hidden", "true");
  frame.referrerPolicy = "no-referrer";
  // Isolate enhanced measurement from all real forms, links, titles and router history.
  frame.src = "/localpro-analytics.html";
  window.addEventListener("message", receive);
  document.body.appendChild(frame);
}

export function trackPage(path: string) {
  if (!allowed) return;
  const safe = analyticsPath(path);
  // Compare pathname only (never query/hash). Different profiles remain distinct navigations,
  // but their identifying slug stays in memory and is never sent or persisted.
  const navigation = path.split(/[?#]/, 1)[0];
  if (navigation === lastPath) return;
  lastPath = navigation;
  emit({ name: "page_view", params: { page_location: `https://localpro.lt${safe}`, page_title: "LocalPro.lt", page_referrer: "" } });
}

export function trackContact(method: "phone" | "email") {
  if (method !== "phone" && method !== "email") return;
  emit({ name: "contact_click", params: { contact_method: method } });
}

// Strictly successful, persisted responses, not seed/demo responses or click-log endpoints.
export function trackConfirmedConversion(kind: "enquiry" | "registration", response: { ok: boolean }, data: unknown) {
  if (!data || typeof data !== "object") return;
  const result = data as { ok?: unknown; mode?: unknown; existingProfile?: unknown; requestId?: unknown; profile?: { id?: unknown } };
  const id = kind === "enquiry" ? result.requestId : result.profile?.id;
  if (!response.ok || result.ok !== true || result.mode === "seed" || result.existingProfile === true || typeof id !== "string" || !id) return;
  const key = `${kind}:${id}`;
  if (completed.has(key)) return;
  completed.add(key); // Do not replay conversions later if consent was absent at completion.
  if (kind === "enquiry") emit({ name: "generate_lead", params: { method: "job_request" } });
  else if (kind === "registration") emit({ name: "sign_up", params: { method: "specialist_registration" } });
}
