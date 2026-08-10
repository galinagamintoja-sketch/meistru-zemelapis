import { beforeEach, describe, expect, it, vi } from "vitest";

const report = { profileId: "11111111-1111-4111-8111-111111111111", reason: "wrong_contact", details: "Telefono numeris priklauso kitam asmeniui.", reporterEmail: "", website: "" };

function install(error: { message: string } | null) {
  vi.doMock("../lib/supabase", () => ({ createServerSupabase: () => ({
    from: () => { const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: report.profileId }, error: null }) }; return query; },
    rpc: async () => ({ data: error ? null : "report-id", error })
  }) }));
}

describe("profile report rate-limit response", () => {
  beforeEach(() => { vi.resetModules(); process.env.PROFILE_REPORT_HASH_SECRET = "test-secret"; });

  it("returns 429 and does not claim acceptance when the atomic limiter rejects", async () => {
    install({ message: "RATE_LIMITED" });
    const { POST } = await import("../app/api/profile-reports/route");
    const response = await POST(new Request("http://localhost/api/profile-reports", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "x-real-ip": "203.0.113.1" }, body: JSON.stringify(report) }));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain("24");
  });

  it("accepts a report when the atomic limiter permits it", async () => {
    install(null);
    const { POST } = await import("../app/api/profile-reports/route");
    const response = await POST(new Request("http://localhost/api/profile-reports", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "x-real-ip": "203.0.113.2" }, body: JSON.stringify(report) }));
    expect(response.status).toBe(201);
  });
});
