// Only LocalPro's production hosts may send analytics. No preview/other-brand traffic.
export const GA4_ID = "G-DE7XEQRBJC";
export const CONSENT_KEY = "localpro.analytics-consent.v1";
export type AnalyticsConsent = "accepted" | "rejected";
type ArchiveEvent = "archive_visit" | "archive_registration_prompt" | "archive_register_click" | "archive_registration_complete";
type FrameEvent = { name: "page_view" | "generate_lead" | "sign_up" | "contact_click" | ArchiveEvent; params: Record<string, string>; leaving?: true };
export const ARCHIVE_JOURNEY_KEY = "localpro.archive-journey.v1";
const JOURNEY_TTL = 30 * 60 * 1000;
type Journey = { v: 1; expires: number; stage: 1 | 2 | 3 | 4 };
let journey: Journey | null = null;
let journeyLoaded = false;

function clearJourney(): boolean {
  journey = null;
  journeyLoaded = true; // Never restore an older journey after rejection in this document.
  try { window.sessionStorage.removeItem(ARCHIVE_JOURNEY_KEY); return true; }
  catch {
    // A denied remove may still allow overwriting. Invalid data always fails closed.
    try { window.sessionStorage.setItem(ARCHIVE_JOURNEY_KEY, "null"); return true; }
    catch { return false; }
  }
}

function currentJourney(): Journey | null {
  if (!allowed) return null;
  if (!journeyLoaded) {
    journeyLoaded = true;
    try {
      const raw = window.sessionStorage.getItem(ARCHIVE_JOURNEY_KEY);
      if (raw !== null) {
        const value = JSON.parse(raw);
        if (!value || Object.keys(value).sort().join(",") !== "expires,stage,v" || value.v !== 1 ||
          ![1, 2, 3, 4].includes(value.stage) || !Number.isSafeInteger(value.expires) ||
          value.expires <= Date.now() || value.expires > Date.now() + JOURNEY_TTL) {
          clearJourney();
        } else journey = value;
      }
    } catch { clearJourney(); }
  }
  if (journey && (journey.expires <= Date.now() || journey.expires > Date.now() + JOURNEY_TTL)) clearJourney();
  return journey;
}

function advanceArchive(stage: Journey["stage"], name: ArchiveEvent, leaving = false): boolean {
  if (!allowed) return false;
  const previous = currentJourney();
  if (stage === 1 ? previous !== null : previous?.stage !== stage - 1) return false;
  const next: Journey = { v: 1, expires: previous?.expires ?? Date.now() + JOURNEY_TTL, stage };
  // Fail closed if persistence is unavailable: never leave a replayable earlier stage.
  try { window.sessionStorage.setItem(ARCHIVE_JOURNEY_KEY, JSON.stringify(next)); }
  catch { clearJourney(); return false; }
  journey = next;
  emit({ name, params: { source: "facebook_archive" }, ...(leaving ? { leaving: true as const } : {}) });
  return true;
}

// Only call these at the actual dialog-show and explicit Google CTA boundaries.
export function trackArchiveRegistrationPrompt() {
  advanceArchive(2, "archive_registration_prompt");
}
export function trackArchiveRegisterClick(leaving = true): Promise<void> | null {
  if (!allowed || currentJourney()?.stage !== 2) return null;
  if (!leaving) { advanceArchive(3, "archive_register_click"); return null; }
  return new Promise<void>(resolve => {
    const finish = () => {
      clearTimeout(timer);
      if (clickDelivery === finish) clickDelivery = null;
      resolve();
    };
    const timer = setTimeout(finish, 500);
    clickDelivery = finish;
    if (!advanceArchive(3, "archive_register_click", true)) finish();
  });
}

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
let clickDelivery: (() => void) | null = null;

function emit(event: FrameEvent) {
  if (!allowed || !frame) return;
  if (!ready) { pending.push(event); return; }
  frame.contentWindow?.postMessage({ type: "localpro:analytics", ...event }, window.location.origin);
}

function receive(event: MessageEvent) {
  if (!allowed || !frame || event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
  if (event.data?.type === "localpro:analytics-sent" && event.data?.name === "archive_register_click") {
    clickDelivery?.();
    return;
  }
  if (event.data?.type !== "localpro:analytics-ready") return;
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
  // If storage cannot erase a rejected/stale journey, acceptance may work in memory,
  // but must not persist across reload and resurrect that old attribution record.
  const unsafeRestore = choice === "accepted" && journeyLoaded && !journey && !clearJourney();
  if (persist || unsafeRestore) {
    try { window.localStorage.setItem(CONSENT_KEY, unsafeRestore ? "rejected" : choice); } catch { /* In-memory consent still works. */ }
  }
  if (choice !== "accepted") {
    allowed = false;
    clickDelivery?.();
    clearJourney();
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
  if (!["localpro.lt", "www.localpro.lt"].includes(window.location.hostname) || window.location.protocol !== "https:") {
    allowed = false;
    clearJourney();
    return;
  }
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
  if (navigation === "/darbu-skelbimai") advanceArchive(1, "archive_visit");
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
  else if (kind === "registration") {
    emit({ name: "sign_up", params: { method: "specialist_registration" } });
    advanceArchive(4, "archive_registration_complete");
  }
}
