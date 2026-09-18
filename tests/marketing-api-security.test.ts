import { beforeEach, describe, expect, it, vi } from "vitest";

describe("marketing API authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.MARKETING_IMPORT_API_KEY;
    vi.doMock("../lib/auth-session", () => ({ requireAdminSession: async () => null }));
    vi.doMock("../lib/supabase", () => ({
      createServerSupabase: () => { throw new Error("unauthorized request reached service-role client"); }
    }));
  });

  it.each([
    ["contacts", "../app/api/admin/marketing/contacts/route"],
    ["overview", "../app/api/admin/marketing/overview/route"]
  ])("rejects unauthorised %s reads before database access", async (_name, modulePath) => {
    const route = await import(modulePath);
    const response = await route.GET(new Request(`http://localhost/api/admin/marketing/${_name}`));
    expect(response.status).toBe(401);
  });

  it("rejects unauthorised draft writes before database access", async () => {
    const { PATCH } = await import("../app/api/admin/marketing/drafts/route");
    const response = await PATCH(new Request("http://localhost/api/admin/marketing/drafts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "draft-id", action: "approve" })
    }));
    expect(response.status).toBe(401);
  });

  it("rejects import without an admin session or scoped import key", async () => {
    const { POST } = await import("../app/api/admin/marketing/import/contacts/route");
    const response = await POST(new Request("http://localhost/api/admin/marketing/import/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact: { Name: "Test" } })
    }));
    expect(response.status).toBe(401);
  });
});
