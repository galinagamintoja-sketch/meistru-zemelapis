import { NextResponse } from "next/server";
import { getGoogleReportingSnapshot } from "../../../../../lib/google-reporting";
import { isReportingMonitorAuthorized, reportingHealth, reportingRequestAllowed } from "../../../../../lib/reporting-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
export async function GET(request: Request) {
  if (!isReportingMonitorAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  if (!reportingRequestAllowed("monitor")) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  try {
    const health = reportingHealth(await getGoogleReportingSnapshot({ window: "7d", includeConversions: true }));
    if (health.status !== "success") console.error("localpro_reporting_health_failed", JSON.stringify(health.sources));
    return NextResponse.json(health, { status: health.status === "success" ? 200 : 503, headers });
  } catch {
    console.error("localpro_reporting_health_failed", "UNAVAILABLE");
    return NextResponse.json({ status: "error", error: "reporting_unavailable" }, { status: 503, headers });
  }
}
