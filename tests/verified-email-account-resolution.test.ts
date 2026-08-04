import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const rpc = vi.fn();
let authUser: Record<string, unknown> | null;

vi.mock("../lib/supabase", () => ({
  createServerSupabase: () => ({ rpc })
}));

vi.mock("../lib/supabase-ssr", () => ({
  createSupabaseAuthClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authUser }, error: null }) }
  })
}));

describe("verified-email account resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    rpc.mockReset();
    authUser = {
      id: "10000000-0000-4000-8000-000000000001",
      email: "  Owner@Example.LT ",
      email_confirmed_at: "2026-08-04T08:00:00.000Z",
      identities: [{ provider: "google", identity_data: { email_verified: true } }]
    };
    rpc.mockResolvedValue({
      data: [{ outcome: "unique_match", candidate_count: 1, linked: false }],
      error: null
    });
  });

  it.each([
    ["Google", [{ provider: "google", identity_data: { email_verified: true } }]],
    ["confirmed Supabase email", [{ provider: "email", identity_data: {} }]]
  ])("allows a verified %s identity and canonicalizes the email", async (_label, identities) => {
    authUser = { ...authUser, identities };
    const { inspectVerifiedEmailResolution } = await import("../lib/verified-email-resolution");

    await expect(inspectVerifiedEmailResolution()).resolves.toEqual({
      outcome: "unique_match",
      candidateCount: 1,
      linked: false
    });
    expect(rpc).toHaveBeenCalledWith("resolve_verified_email_account", {
      p_auth_user_id: "10000000-0000-4000-8000-000000000001",
      p_email: "owner@example.lt",
      p_confirm: false
    });
  });

  it("rejects an unverified authenticated email before database resolution", async () => {
    authUser = { ...authUser, email_confirmed_at: null, identities: [{ provider: "email" }] };
    const { inspectVerifiedEmailResolution } = await import("../lib/verified-email-resolution");

    await expect(inspectVerifiedEmailResolution()).resolves.toEqual({
      outcome: "unverified_email",
      candidateCount: 0,
      linked: false
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("confirms through one atomic operation and returns no candidate profile data", async () => {
    rpc.mockResolvedValue({ data: [{ outcome: "linked", candidate_count: 1, linked: true }], error: null });
    const { POST } = await import("../app/api/meistras/resolve-account/route");
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, outcome: "linked", candidateCount: 1, dashboardUrl: "/meistras/uzklausos" });
    expect(rpc).toHaveBeenCalledWith("resolve_verified_email_account", expect.objectContaining({ p_confirm: true }));
    expect(JSON.stringify(body)).not.toMatch(/profile|email|phone|name/i);
  });

  it("keeps the operation separate from claims and exposes only a generic one-click confirmation", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const migration = fs.readFileSync(path.join(root, "supabase/migrations/023_verified_email_account_resolution.sql"), "utf8");
    const page = fs.readFileSync(path.join(root, "app/meistras/susieti/page.tsx"), "utf8");
    const confirmation = fs.readFileSync(path.join(root, "components/account-resolution-confirmation.tsx"), "utf8");

    expect(migration).toContain("resolve_verified_email_account");
    expect(migration).not.toContain("create or replace function claim_tradesperson_profile");
    expect(migration).toContain("lower(trim(email))");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("where id = matched_profile.id and user_id is null");
    expect(migration).toContain("account_resolution_audit");
    expect(page).toContain("Reikia administratoriaus sprendimo");
    expect(page).not.toMatch(/display_name|phone|matched_profile/);
    expect(confirmation).toContain("Atidaryti paskyrą");
  });
});
