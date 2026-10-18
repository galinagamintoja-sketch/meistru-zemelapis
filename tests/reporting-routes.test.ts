import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth-session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("../lib/google-reporting", () => ({ getGoogleReportingSnapshot: vi.fn() }));
import { requireAdminSession } from "../lib/auth-session";
import { getGoogleReportingSnapshot, type GoogleReportingSnapshot } from "../lib/google-reporting";
import { GET as report } from "../app/api/admin/analytics/route";
import { GET as health } from "../app/api/internal/analytics/health/route";
import { createReportingLimiter, isReportingMonitorAuthorized } from "../lib/reporting-health";
import AnalyticsPage from "../app/admin/analytics/page";
import { renderToStaticMarkup } from "react-dom/server";
const token = "synthetic-monitor-token-at-least-32-characters";
function snapshot(): GoogleReportingSnapshot {
  const success = { status: "success" as const, empty: true, data: { rows: [], quota: {} }, fetchedAt: "2026-10-17T00:00:00Z" };
  return { status: "success", window: "28d", ga4: success, realtime: success, searchConsole: success, conversions: success, archiveFunnel: { ...success, data: { ...success.data, dateRange: { startDate: "2026-09-19", endDate: "2026-10-16" }, archiveToClickRate: null, archiveToCompletedRate: null, sampled: false } } };
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("GOOGLE_REPORTING_MONITOR_TOKEN", token); });
describe("private reporting boundaries", () => {
  it("redirects anonymous admin page visitors before reporting", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue(null);
    await expect(AnalyticsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(getGoogleReportingSnapshot).not.toHaveBeenCalled();
  });

  it("renders the actual private Lithuanian funnel with server-calculated rates and explicit dates and limits", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({ email: "owner@example.invalid", name: "Owner", googleSub: "test", expiresAt: 1 });
    const s = snapshot();
    s.archiveFunnel = { status: "success", empty: false, fetchedAt: "2026-10-17T00:00:00Z", data: {
      dateRange: { startDate: "2026-09-19", endDate: "2026-10-16" }, quota: {}, sampled: true,
      archiveToClickRate: 0.2, archiveToCompletedRate: 0.05,
      rows: [{ eventName: "archive_visit", activeUsers: 100, completionRateToNext: 0.6, dropoffRateToNext: 0.4 },
        { eventName: "archive_registration_prompt", activeUsers: 60, completionRateToNext: 1 / 3, dropoffRateToNext: 2 / 3 },
        { eventName: "archive_register_click", activeUsers: 20, completionRateToNext: 0.25, dropoffRateToNext: 0.75 },
        { eventName: "archive_registration_complete", activeUsers: 5, completionRateToNext: null, dropoffRateToNext: null }]
    } };
    vi.mocked(getGoogleReportingSnapshot).mockResolvedValue(s);
    const html = renderToStaticMarkup(await AnalyticsPage());
    expect(getGoogleReportingSnapshot).toHaveBeenCalledWith({ window: "28d", includeConversions: true });
    for (const text of ["2026-09-19", "2026-10-16", "20.00%", "5.00%", "60.00%", "40.00%", "Užbaigta nauja registracija", "negarantuoja vienos GA4 sesijos", "Ataskaita paremta duomenų imtimi."]) expect(html).toContain(text);
    expect(html).toContain("<td>—</td>");
  });

  it.each(["empty", "forbidden", "unsupported"])("renders %s funnel distinctly on the authenticated admin page", async state => {
    vi.mocked(requireAdminSession).mockResolvedValue({ email: "owner@example.invalid", name: "Owner", googleSub: "test", expiresAt: 1 });
    const s = snapshot();
    if (state !== "empty") s.archiveFunnel = { status: "error", error: { code: state === "forbidden" ? "FORBIDDEN" : "UNSUPPORTED", httpStatus: state === "forbidden" ? 403 : 404, retryable: false } };
    vi.mocked(getGoogleReportingSnapshot).mockResolvedValue(s);
    const html = renderToStaticMarkup(await AnalyticsPage());
    if (state === "empty") {
      expect(html).toContain("šio laikotarpio piltuvo duomenų dar nėra");
      expect(html).toContain("registracijos paspaudimas: —");
    } else {
      expect(html).toContain(state === "forbidden" ? "FORBIDDEN" : "UNSUPPORTED");
      expect(html).not.toContain("šio laikotarpio piltuvo duomenų dar nėra");
    }
  });

  it("fails closed within eight seconds when the existing auth service stalls", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(requireAdminSession).mockReturnValue(new Promise(() => {}));
      const pending = report(new Request("https://localpro.lt/api/admin/analytics"));
      await vi.advanceTimersByTimeAsync(8_000);
      expect((await pending).status).toBe(401);
      expect(getGoogleReportingSnapshot).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("fails closed on authentication service errors without touching reporting", async () => {
    vi.mocked(requireAdminSession).mockRejectedValue(Error("auth upstream private payload"));
    const response = await report(new Request("https://localpro.lt/api/admin/analytics"));
    expect(response.status).toBe(401);
    expect(getGoogleReportingSnapshot).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("private payload");
  });
  it("bounds per-instance authenticated requests and resets after one minute", () => {
    let now = 1000;
    const allowed = createReportingLimiter(() => now);
    for (let i = 0; i < 30; i++) expect(allowed("admin")).toBe(true);
    expect(allowed("admin")).toBe(false);
    for (let i = 0; i < 6; i++) expect(allowed("monitor")).toBe(true);
    expect(allowed("monitor")).toBe(false);
    now += 60_000;
    expect(allowed("admin")).toBe(true);
    expect(allowed("monitor")).toBe(true);
  });
  it("rejects unauthenticated reports before accessing credentials or Google", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue(null);
    const result = await report(new Request("https://localpro.lt/api/admin/analytics?window=28d", { headers: { authorization: `Bearer ${token}` } }));
    expect(result.status).toBe(401);
    expect(getGoogleReportingSnapshot).not.toHaveBeenCalled();
    expect(result.headers.get("cache-control")).toBe("private, no-store");
  });
  it("returns only the fixed authenticated report with supported windows", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({ email: "owner@example.invalid", name: "Owner", googleSub: "test", expiresAt: 1 });
    vi.mocked(getGoogleReportingSnapshot).mockResolvedValue(snapshot());
    const result = await report(new Request("https://localpro.lt/api/admin/analytics?window=7d"));
    expect(result.status).toBe(200);
    expect(getGoogleReportingSnapshot).toHaveBeenCalledWith({ window: "7d", includeConversions: true });
    expect((await result.json()).ga4.empty).toBe(true);
    expect((await report(new Request("https://localpro.lt/api/admin/analytics?window=1000d"))).status).toBe(400);
  });
  it("does not leak thrown errors and marks all-source failures unavailable", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({ email: "owner@example.invalid", name: "Owner", googleSub: "test", expiresAt: 1 });
    vi.mocked(getGoogleReportingSnapshot).mockRejectedValue(Error("SECRET-BODY-PRIVATE-KEY"));
    const result = await report(new Request("https://localpro.lt/api/admin/analytics"));
    expect(result.status).toBe(502);
    expect(await result.text()).not.toContain("SECRET");
  });
  it("fails closed without a strong exact monitor token, ignoring cookies and query tokens", async () => {
    vi.stubEnv("GOOGLE_REPORTING_MONITOR_TOKEN", "");
    expect(isReportingMonitorAuthorized(new Request("https://localpro.lt"))).toBe(false);
    vi.stubEnv("GOOGLE_REPORTING_MONITOR_TOKEN", token);
    for (const authorization of ["", `Bearer ${token}extra`, `bearer ${token}`, "Bearer bad"]) {
      const result = await health(new Request(`https://localpro.lt/api/internal/analytics/health?token=${token}`, { headers: { authorization, cookie: "role=admin" } }));
      expect(result.status).toBe(401);
    }
    expect(getGoogleReportingSnapshot).not.toHaveBeenCalled();
  });
  it("accepts valid empty reports and emits only health summaries, not rows or secrets", async () => {
    vi.mocked(getGoogleReportingSnapshot).mockResolvedValue(snapshot());
    const result = await health(new Request("https://localpro.lt/api/internal/analytics/health", { headers: { authorization: `Bearer ${token}` } }));
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.sources.searchConsole).toMatchObject({ status: "success", empty: true, rows: 0 });
    expect(body.sources.searchConsole.data).toBeUndefined();
    expect(body.sources.archiveFunnel).toMatchObject({ status: "success", empty: true, rows: 0 });
    expect(JSON.stringify(body)).not.toContain(token);
  });
  it.each(["ga4", "archiveFunnel"] as const)("makes a partial %s failure fail monitoring instead of silently reporting healthy", async source => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = snapshot();
    s.status = "partial";
    s[source] = { status: "error", error: { code: "FORBIDDEN", httpStatus: 403, retryable: false } };
    vi.mocked(getGoogleReportingSnapshot).mockResolvedValue(s);
    const result = await health(new Request("https://localpro.lt/api/internal/analytics/health", { headers: { authorization: `Bearer ${token}` } }));
    expect(result.status).toBe(503);
    expect((await result.json()).sources[source]).toEqual({ status: "error", code: "FORBIDDEN" });
    warn.mockRestore();
  });
});
