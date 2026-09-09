import { beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.fn();
const updateUser = vi.fn();
const getUser = vi.fn();

vi.mock("../lib/supabase-ssr", () => ({
  createSupabaseAuthClient: async () => ({ auth: { resetPasswordForEmail, updateUser, getUser } })
}));

describe("email auth recovery actions", () => {
  beforeEach(() => {
    vi.resetModules();
    resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
    updateUser.mockReset().mockResolvedValue({ error: null });
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "recovery-user" } } });
  });

  it("accepts recovery with email only", async () => {
    const { POST } = await import("../app/api/auth/email/route");
    const response = await POST(new Request("https://localpro.lt/api/auth/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "recovery", email: "meistras@example.lt" })
    }));
    expect(response.status).toBe(200);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("meistras@example.lt", expect.any(Object));
  });

  it("accepts an authenticated password update with password only", async () => {
    const { POST } = await import("../app/api/auth/email/route");
    const response = await POST(new Request("https://localpro.lt/api/auth/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update-password", password: "naujas-slaptažodis" })
    }));
    expect(response.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({ password: "naujas-slaptažodis" });
  });
});
