import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "admin-id", email: "admin@example.lt", email_confirmed_at: "2026-01-01" } as Record<string, unknown> | null,
  linked: vi.fn(), resolution: vi.fn(), exchange: vi.fn(),
}));
vi.mock("../lib/supabase-ssr", () => ({ createSupabaseAuthClient: async () => ({ auth: {
  getUser: async () => ({ data: { user: mocks.user }, error: null }),
  exchangeCodeForSession: mocks.exchange,
} }) }));
vi.mock("../lib/tradesperson-account", () => ({
  getLinkedTradespersonProfile: mocks.linked,
  requireTradespersonUser: async () => {
    if (!mocks.user) throw new Error("REDIRECT:/login");
    return mocks.user;
  },
}));
vi.mock("../lib/verified-email-resolution", () => ({ inspectVerifiedEmailResolution: mocks.resolution }));
vi.mock("../lib/specialists", () => ({ getCategories: async () => [] }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("../components/LocalProApp", () => ({ default: () => null }));
vi.mock("../components/tradesperson-shell", () => ({ TradespersonShell: () => null }));

import { adminDestination } from "../lib/admin-destination";
import { GET } from "../app/auth/callback/route";
import LoginPage from "../app/login/page";
import RegistrationPage from "../app/meistro-registracija/page";
import TradespersonLayout from "../app/meistras/layout";

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAIL_ALLOWLIST", "admin@example.lt");
  mocks.user = { id: "admin-id", email: "admin@example.lt", email_confirmed_at: "2026-01-01" };
  mocks.linked.mockReset().mockResolvedValue(null);
  mocks.resolution.mockReset().mockResolvedValue({ outcome: "ambiguous", candidateCount: 2, linked: false });
  mocks.exchange.mockReset().mockResolvedValue({ error: null });
});

describe("verified administrator routing without ownership changes", () => {
  it("requires confirmed server-verified allowlisted email", () => {
    expect(adminDestination(null)).toBeNull();
    expect(adminDestination({ email: "admin@example.lt", email_confirmed_at: undefined })).toBeNull();
    expect(adminDestination({ email: "ordinary@example.lt", email_confirmed_at: "yes" })).toBeNull();
    expect(adminDestination({ email: " ADMIN@EXAMPLE.LT ", email_confirmed_at: "yes" })).toBe("/admin");
  });
  it.each(["/meistras", "/meistras/susieti", "/darbu-skelbimai", "/meistro-registracija", "/admin", "/admin/darbu-skelbimai"])("OAuth routes admin safely from %s before ownership lookup", async (next) => {
    const response = await GET(new Request(`https://localpro.lt/auth/callback?code=valid&next=${encodeURIComponent(next)}`));
    expect(response.headers.get("location")).toBe(`https://localpro.lt${next.startsWith("/admin") ? next : "/admin"}`);
    expect(mocks.linked).not.toHaveBeenCalled();
    expect(mocks.resolution).not.toHaveBeenCalled();
  });
  it("keeps unauthenticated callback failures out of admin", async () => {
    mocks.user = null;
    const response = await GET(new Request("https://localpro.lt/auth/callback?code=valid"));
    expect(response.headers.get("location")).toBe("https://localpro.lt/login?error=oauth_callback");
  });
  it("authenticated admin login goes directly to admin rather than registration", async () => {
    await expect(LoginPage({ searchParams: Promise.resolve({ next: "/darbu-skelbimai" }) })).rejects.toThrow("REDIRECT:/admin");
    expect(mocks.linked).not.toHaveBeenCalled();
  });
  it("admin registration never resolves ambiguous profiles", async () => {
    await expect(RegistrationPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/admin");
    expect(mocks.linked).not.toHaveBeenCalled();
    expect(mocks.resolution).not.toHaveBeenCalled();
  });
  it("all tradesperson URLs, including the linking screen, redirect admin before ownership lookup", async () => {
    await expect(TradespersonLayout({ children: null })).rejects.toThrow("REDIRECT:/admin");
    expect(mocks.linked).not.toHaveBeenCalled();
  });
  it("ordinary users still enter the ambiguous ownership security flow", async () => {
    mocks.user = { id: "ordinary-id", email: "ordinary@example.lt", email_confirmed_at: "yes", user_metadata: { role: "admin" } };
    await expect(RegistrationPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/meistras/susieti");
    expect(mocks.linked).toHaveBeenCalledWith("ordinary-id");
    expect(mocks.resolution).toHaveBeenCalledOnce();
  });
  it("ordinary OAuth login without a linked profile still requires registration", async () => {
    mocks.user = { id: "ordinary-id", email: "ordinary@example.lt", email_confirmed_at: "yes" };
    const response = await GET(new Request("https://localpro.lt/auth/callback?code=valid&next=/meistras"));
    expect(response.headers.get("location")).toBe("https://localpro.lt/meistro-registracija");
    expect(mocks.linked).toHaveBeenCalledWith("ordinary-id");
  });
});
