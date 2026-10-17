import "server-only";
import { timingSafeEqual } from "node:crypto";
import { requireAdminSession } from "./auth-session";
import type { GoogleReportingSnapshot } from "./google-reporting";

// Leave room for the 45-second Google snapshot within the 60-second route limit.
// Reuse the existing admin boundary; an unavailable/slow auth service fails closed.
export async function getReportingAdminSession(request?: Request) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      requireAdminSession(request),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 8_000); })
    ]);
  } catch { return null; }
  finally { if (timer) clearTimeout(timer); }
}

export function isReportingMonitorAuthorized(request: Request) {
  const secret = process.env.GOOGLE_REPORTING_MONITOR_TOKEN;
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
// Small, bounded per-warm-instance quota guard; not a distributed/global rate limiter.
export function createReportingLimiter(now: () => number = Date.now) {
  const buckets = new Map<string, { count: number; reset: number }>();
  return (bucket: "admin" | "monitor") => {
    const time = now();
    let value = buckets.get(bucket);
    if (!value || value.reset <= time) { value = { count: 0, reset: time + 60_000 }; buckets.set(bucket, value); }
    if (value.count >= (bucket === "monitor" ? 6 : 30)) return false;
    value.count++;
    return true;
  };
}
export const reportingRequestAllowed = createReportingLimiter();

export function reportingHealth(snapshot: GoogleReportingSnapshot) {
  const sources = { ga4: snapshot.ga4, realtime: snapshot.realtime, searchConsole: snapshot.searchConsole, conversions: snapshot.conversions };
  return { status: snapshot.status, checkedAt: new Date().toISOString(), sources: Object.fromEntries(Object.entries(sources).map(([source, result]) => [source,
    result?.status === "success" ? { status: "success", empty: result.empty, rows: result.data.rows.length, fetchedAt: result.fetchedAt }
      : { status: "error", code: result?.status === "error" ? result.error.code : "NOT_CHECKED" }])) };
}
