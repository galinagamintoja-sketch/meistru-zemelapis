import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn(async () => ({ error: null }));
const signInWithPassword = vi.fn();

describe("independent CRM authentication", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRM_ADMIN_EMAIL_ALLOWLIST = "crm-admin@example.lt";
    vi.doMock("../lib/marketing/supabase", () => ({
      createMarketingAuthClient: async () => ({ auth: { signInWithPassword, signOut } }),
    }));
  });

  it("accepts an allowlisted CRM email/password account", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { email: "crm-admin@example.lt" }, session: { access_token: "test" } },
      error: null,
    });
    const { POST } = await import("../app/api/admin/marketing/auth/login/route");
    const response = await POST(new Request("http://localhost/api/admin/marketing/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "crm-admin@example.lt", password: "test-password" }),
    }));
    expect(response.status).toBe(200);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("rejects and signs out a valid but non-allowlisted CRM account", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { email: "other@example.lt" }, session: { access_token: "test" } },
      error: null,
    });
    const { POST } = await import("../app/api/admin/marketing/auth/login/route");
    const response = await POST(new Request("http://localhost/api/admin/marketing/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "other@example.lt", password: "test-password" }),
    }));
    expect(response.status).toBe(401);
    expect(signOut).toHaveBeenCalledOnce();
  });
});
