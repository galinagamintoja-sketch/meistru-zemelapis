import { NextResponse } from "next/server";
import { getReportingAdminSession, reportingRequestAllowed } from "../../../../lib/reporting-health";
import { getGoogleReportingSnapshot, type ReportingWindow } from "../../../../lib/google-reporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
export async function GET(request: Request) {
  if (!await getReportingAdminSession(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  const window = new URL(request.url).searchParams.get("window") ?? "28d";
  if (!["7d", "28d", "90d"].includes(window)) return NextResponse.json({ error: "invalid_window" }, { status: 400, headers });
  if (!reportingRequestAllowed("admin")) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  try {
    const report = await getGoogleReportingSnapshot({ window: window as ReportingWindow, includeConversions: true });
    return NextResponse.json(report, { headers, status: report.status === "error" ? 502 : 200 });
  } catch { return NextResponse.json({ error: "reporting_unavailable" }, { status: 502, headers }); }
}
