import { beforeEach, describe, expect, it, vi } from "vitest";
import { installSupabaseMock as installBaseSupabaseMock } from "./helpers/supabase";

function installSupabaseMock(
  tables: Record<string, Record<string, unknown>[]>,
  operations: Array<Record<string, unknown>> = [],
  rpcHandler: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> = async (_name, args) => ({
    data: [{ public_status: args.p_visible ? "public" : "private", changed: true }],
    error: null
  })
) {
  installBaseSupabaseMock(tables, operations, {}, rpcHandler);
}

let ownedProfile: Record<string, unknown> | null;

vi.mock("../lib/tradesperson-account", () => ({
  requireOwnedProfile: async () => ({
    user: { id: "auth-owner" },
    profile: ownedProfile
  })
}));

const completeProfile = {
  id: "owned-profile",
  user_id: "local-owner",
  display_name: "Testinis meistras",
  company_name: null,
  phone: "+37061234567",
  service_category_id: "category-id",
  description: "Pakankamai ilgas profilio aprašymas, turintis daugiau nei aštuoniasdešimt simbolių publikavimo patikrai.",
  public_contact_consent_at: "2026-08-04T08:00:00.000Z",
  approval_status: "approved",
  public_status: "public",
  operating_areas: [{ city: "Lazdijai", radius_km: 25 }],
  profile_services: [{ service_subcategory_id: "service-1" }, { service_subcategory_id: "service-2" }],
  profile_photos: []
};

describe("tradesperson temporary profile visibility", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    ownedProfile = { ...completeProfile };
  });

  it("hides an approved public profile without changing its approval status", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installSupabaseMock({ tradesperson_profiles: [{ ...completeProfile }], admin_actions: [] }, operations);

    const { PATCH } = await import("../app/api/meistras/visibility/route");
    const response = await PATCH(new Request("http://localhost/api/meistras/visibility", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visible: false })
    }));

    expect(response.status).toBe(200);
    expect(operations).toContainEqual(expect.objectContaining({
      type: "rpc",
      name: "set_owned_profile_visibility",
      args: {
        p_profile_id: "owned-profile",
        p_visible: false
      }
    }));
  });

  it("restores only an approved and publication-ready profile", async () => {
    const operations: Array<Record<string, unknown>> = [];
    const hidden = { ...completeProfile, public_status: "private" };
    ownedProfile = hidden;
    installSupabaseMock({ tradesperson_profiles: [hidden], admin_actions: [] }, operations);

    const { PATCH } = await import("../app/api/meistras/visibility/route");
    const response = await PATCH(new Request("http://localhost/api/meistras/visibility", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visible: true })
    }));

    expect(response.status).toBe(200);
    expect(operations).toContainEqual(expect.objectContaining({
      type: "rpc",
      name: "set_owned_profile_visibility",
      args: {
        p_profile_id: "owned-profile",
        p_visible: true
      }
    }));
  });

  it("restores an approved profile while a pending replacement stays private", async () => {
    const operations: Array<Record<string, unknown>> = [];
    const hidden = {
      ...completeProfile,
      public_status: "private",
      profile_photos: [
        { id: "approved-photo", moderation_status: "approved", removed_from_profile_at: null },
        { id: "pending-replacement", moderation_status: "pending", removed_from_profile_at: null }
      ]
    };
    ownedProfile = hidden;
    installSupabaseMock({ tradesperson_profiles: [hidden], admin_actions: [] }, operations);

    const { PATCH } = await import("../app/api/meistras/visibility/route");
    const response = await PATCH(new Request("http://localhost/api/meistras/visibility", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ visible: true })
    }));

    expect(response.status).toBe(200);
    expect(operations).not.toContainEqual(expect.objectContaining({
      table: "profile_photos",
      type: "update"
    }));
  });

  it.each([
    ["pending", { approval_status: "pending" }],
    ["rejected", { approval_status: "rejected" }],
    ["incomplete", { description: "Per trumpas" }],
    ["without consent", { public_contact_consent_at: null }]
  ])("does not publish a %s profile", async (_label, patch) => {
    const operations: Array<Record<string, unknown>> = [];
    const hidden = { ...completeProfile, public_status: "private", ...patch };
    ownedProfile = hidden;
    installSupabaseMock({ tradesperson_profiles: [hidden], admin_actions: [] }, operations);

    const { PATCH } = await import("../app/api/meistras/visibility/route");
    const response = await PATCH(new Request("http://localhost/api/meistras/visibility", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visible: true })
    }));

    expect(response.status).toBe(409);
    expect(operations).not.toContainEqual(expect.objectContaining({ type: "rpc" }));
  });

  it("rejects an account without an owned profile", async () => {
    ownedProfile = null;
    installSupabaseMock({ tradesperson_profiles: [], admin_actions: [] });

    const { PATCH } = await import("../app/api/meistras/visibility/route");
    const response = await PATCH(new Request("http://localhost/api/meistras/visibility", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visible: false })
    }));

    expect(response.status).toBe(403);
  });

  it("does not accept a browser-supplied profile identifier", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installSupabaseMock({ tradesperson_profiles: [{ ...completeProfile }], admin_actions: [] }, operations);

    const { PATCH } = await import("../app/api/meistras/visibility/route");
    const response = await PATCH(new Request("http://localhost/api/meistras/visibility", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visible: false, profileId: "another-profile" })
    }));

    expect(response.status).toBe(400);
    expect(operations).not.toContainEqual(expect.objectContaining({ type: "rpc" }));
  });

  it("rejects a cross-origin visibility request", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installSupabaseMock({ tradesperson_profiles: [{ ...completeProfile }], admin_actions: [] }, operations);

    const { PATCH } = await import("../app/api/meistras/visibility/route");
    const response = await PATCH(new Request("http://localhost/api/meistras/visibility", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ visible: false })
    }));

    expect(response.status).toBe(403);
    expect(operations).not.toContainEqual(expect.objectContaining({ type: "rpc" }));
  });

  it("returns an error without a separate profile write when the atomic operation rolls back", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installSupabaseMock(
      { tradesperson_profiles: [{ ...completeProfile }], admin_actions: [] },
      operations,
      async () => ({ data: null, error: { message: "audit insert failed; transaction rolled back" } })
    );

    const { PATCH } = await import("../app/api/meistras/visibility/route");
    const response = await PATCH(new Request("http://localhost/api/meistras/visibility", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ visible: false })
    }));

    expect(response.status).toBe(500);
    expect(operations).toContainEqual(expect.objectContaining({
      type: "rpc",
      name: "set_owned_profile_visibility"
    }));
    expect(operations).not.toContainEqual(expect.objectContaining({ table: "tradesperson_profiles", type: "update" }));
    expect(operations).not.toContainEqual(expect.objectContaining({ table: "admin_actions", type: "insert" }));
  });
});
