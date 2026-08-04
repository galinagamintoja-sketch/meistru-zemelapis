import { beforeEach, describe, expect, it, vi } from "vitest";
import { installSupabaseMock } from "./helpers/supabase";

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
      table: "tradesperson_profiles",
      type: "update",
      values: { public_status: "private" }
    }));
    expect(operations).not.toContainEqual(expect.objectContaining({
      table: "tradesperson_profiles",
      values: expect.objectContaining({ approval_status: expect.anything() })
    }));
    expect(operations).toContainEqual(expect.objectContaining({
      table: "admin_actions",
      type: "insert",
      values: expect.objectContaining({
        tradesperson_profile_id: "owned-profile",
        action: "tradesperson_profile_hidden",
        created_by_role: "tradesperson"
      })
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
      table: "tradesperson_profiles",
      type: "update",
      values: { public_status: "public" }
    }));
    expect(operations).toContainEqual(expect.objectContaining({
      table: "admin_actions",
      type: "insert",
      values: expect.objectContaining({ action: "tradesperson_profile_restored" })
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
    expect(operations).not.toContainEqual(expect.objectContaining({ table: "tradesperson_profiles", type: "update" }));
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
    expect(operations).not.toContainEqual(expect.objectContaining({ table: "tradesperson_profiles", type: "update" }));
  });
});
