import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { GoogleReportingSnapshot } from "../lib/google-reporting";

const mocks = vi.hoisted(() => ({ session: vi.fn(), allowed: vi.fn(), snapshot: vi.fn(), redirect: vi.fn() }));
vi.mock("../lib/google-reporting", () => ({ getGoogleReportingSnapshot: mocks.snapshot }));
vi.mock("../lib/reporting-health", () => ({ getReportingAdminSession: mocks.session, reportingRequestAllowed: mocks.allowed }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import AnalyticsPage from "../app/admin/analytics/page";

const names = ["archive_visit", "archive_registration_prompt", "archive_register_click", "archive_registration_complete"] as const;
function fixture(empty = false): GoogleReportingSnapshot {
  const counts = empty ? [0, 0, 0, 0] : [100, 60, 20, 5];
  const result = <T,>(data: T) => ({ status: "success" as const, empty: true, fetchedAt: "2026-10-18T00:00:00Z", data });
  return {
    status: "success", window: "28d",
    ga4: result({ rows: [], quota: {} }), realtime: result({ rows: [], quota: {} }),
    conversions: result({ rows: [], quota: {} }), searchConsole: result({ rows: [] }),
    archiveFunnel: { ...result({
      dateRange: { startDate: "2026-09-20", endDate: "2026-10-17" },
      rows: names.map((eventName, i) => {
        const rate = i === 3 || counts[i] === 0 ? null : counts[i + 1] / counts[i];
        return { eventName, activeUsers: counts[i], completionRateToNext: rate, dropoffRateToNext: rate === null ? null : 1 - rate };
      }),
      archiveToClickRate: empty ? null : counts[2] / counts[0],
      archiveToCompletedRate: empty ? null : counts[3] / counts[0], sampled: false, quota: {}
    }), empty }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "test-admin" } });
  mocks.allowed.mockReturnValue(true);
  mocks.snapshot.mockResolvedValue(fixture());
  mocks.redirect.mockImplementation(() => { throw new Error("redirected-before-reporting"); });
});

describe("private archive funnel dashboard rendering", () => {
  it("renders ordered aggregate counts and separate click/completed-registration rates", async () => {
    const html = renderToStaticMarkup(await AnalyticsPage());
    expect(mocks.snapshot).toHaveBeenCalledWith({ window: "28d", includeConversions: true });
    expect(html).toContain("Archyvo apsilankymas");
    expect(html).toContain("Registracijos pasiūlymas");
    expect(html).toContain("Registracijos paspaudimas");
    expect(html).toContain("Užbaigta nauja registracija");
    expect(html).toContain("registracijos paspaudimas: 20.00%");
    expect(html).toContain("užbaigta nauja registracija: 5.00%");
    expect(html).toContain("ne įvykių sumos");
    expect(html).not.toContain("NaN");
  });
  it("renders empty successful access with unavailable rates, not fabricated conversion percentages", async () => {
    mocks.snapshot.mockResolvedValue(fixture(true));
    const html = renderToStaticMarkup(await AnalyticsPage());
    expect(html).toContain("šio laikotarpio piltuvo duomenų dar nėra");
    expect(html).toContain("registracijos paspaudimas: —");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });
  it("keeps funnel permission failure distinct from zero visitors or empty successful access", async () => {
    const input = fixture();
    input.status = "partial";
    input.archiveFunnel = { status: "error", error: { code: "FORBIDDEN", httpStatus: 403, retryable: false } };
    mocks.snapshot.mockResolvedValue(input);
    const html = renderToStaticMarkup(await AnalyticsPage());
    expect(html).toContain("FORBIDDEN");
    expect(html).not.toContain("registracijos paspaudimas: 0.00%");
    expect(html).not.toContain("šio laikotarpio piltuvo duomenų dar nėra");
  });
  it("rejects an anonymous page request before loading any Google report", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(AnalyticsPage()).rejects.toThrow("redirected-before-reporting");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=%2Fadmin%2Fanalytics");
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(mocks.allowed).not.toHaveBeenCalled();
  });
  it("does not request reports when the authorized page is rate-limited", async () => {
    mocks.allowed.mockReturnValue(false);
    const html = renderToStaticMarkup(await AnalyticsPage());
    expect(html).toContain("Per daug užklausų");
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
