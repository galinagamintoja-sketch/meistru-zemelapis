import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth-session", () => ({ requireAdminSession: vi.fn() }));
vi.mock("../lib/google-reporting", () => ({ getGoogleReportingSnapshot: vi.fn() }));
import { requireAdminSession } from "../lib/auth-session";
import { getGoogleReportingSnapshot, type GoogleReportingSnapshot } from "../lib/google-reporting";
import { GET as report } from "../app/api/admin/analytics/route";
import { GET as health } from "../app/api/internal/analytics/health/route";
import { createReportingLimiter, isReportingMonitorAuthorized } from "../lib/reporting-health";
const token = "synthetic-monitor-token-at-least-32-characters";
function snapshot(): GoogleReportingSnapshot {
  const success = { status: "success" as const, empty: true, data: { rows: [], quota: {} }, fetchedAt: "2026-10-17T00:00:00Z" };
  return { status: "success", window: "28d", ga4: success, realtime: success, searchConsole: success, conversions: success };
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("GOOGLE_REPORTING_MONITOR_TOKEN", token); });
describe("private reporting boundaries", () => {
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
    expect(JSON.stringify(body)).not.toContain(token);
  });
  it("makes a partial API failure fail monitoring instead of silently reporting healthy", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = snapshot();
    s.status = "partial";
    s.ga4 = { status: "error", error: { code: "FORBIDDEN", httpStatus: 403, retryable: false } };
    vi.mocked(getGoogleReportingSnapshot).mockResolvedValue(s);
    const result = await health(new Request("https://localpro.lt/api/internal/analytics/health", { headers: { authorization: `Bearer ${token}` } }));
    expect(result.status).toBe(503);
    expect((await result.json()).sources.ga4).toEqual({ status: "error", code: "FORBIDDEN" });
    warn.mockRestore();
  });
});
