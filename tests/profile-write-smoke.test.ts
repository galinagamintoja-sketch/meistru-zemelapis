import { beforeEach, describe, expect, it, vi } from "vitest";
import { baseProfile, validRegistration } from "./helpers/fixtures";
import { adminPatchRequest, registrationPostRequest, signedCookie } from "./helpers/requests";
import { installSupabaseMock } from "./helpers/supabase";

function installGeoMock() {
  vi.doMock("../lib/geo", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../lib/geo")>()),
    resolveLithuanianCoordinates: vi.fn(async () => null),
    resolveRegisteredAddressCoordinates: vi.fn(async () => null)
  }));
}

function installProfileWriteTables(operations: Array<Record<string, unknown>>, extraTables: Record<string, Record<string, unknown>[]> = {}) {
  installSupabaseMock(
    {
      service_categories: [{ id: "cat-apdaila", slug: "apdaila", name: "Apdaila" }],
      service_subcategories: [
        { id: "sub-dazymas", slug: "dazymas", service_category_id: "cat-apdaila" },
        { id: "sub-glaistymas", slug: "glaistymas", service_category_id: "cat-apdaila" },
        { id: "sub-plyteles", slug: "plyteles", service_category_id: "cat-apdaila" }
      ],
      tradesperson_profiles: [],
      profile_services: [],
      operating_areas: [],
      profile_photos: [],
      consent_logs: [],
      admin_actions: [],
      ...extraTables
    },
    operations
  );
}

describe("profile write regression smoke", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("../lib/supabase");
    vi.doUnmock("../lib/geo");
    installGeoMock();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
    process.env.AUTH_SESSION_SECRET = "test-secret";
    process.env.ADMIN_EMAIL_ALLOWLIST = "admin@example.lt";
    delete process.env.LOCALPRO_SEED_MODE;
  });

  it("handles normal self-registration and manual-address fallback registration", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installProfileWriteTables(operations);

    const { POST } = await import("../app/api/tradesperson/register/route");
    const normalResponse = await POST(registrationPostRequest(validRegistration));
    const manualResponse = await POST(
      registrationPostRequest({
        ...validRegistration,
        placeId: "",
        latitude: null,
        longitude: null,
        address: "Traku g. 10, Lentvaris",
        town: "Lentvaris",
        street: "Traku g.",
        postcode: ""
      })
    );

    expect(normalResponse.status).toBe(200);
    expect(manualResponse.status).toBe(200);
    expect(operations).toContainEqual(expect.objectContaining({ table: "tradesperson_profiles", type: "insert" }));
    expect(operations).toContainEqual(expect.objectContaining({ table: "operating_areas", type: "insert" }));
    expect(operations).toContainEqual(expect.objectContaining({ table: "consent_logs", type: "insert" }));
  });

  it("creates admin profiles as pending/private", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installProfileWriteTables(operations);

    const { POST } = await import("../app/api/admin/profiles/route");
    const response = await POST(
      new Request("http://localhost/api/admin/profiles", {
        method: "POST",
        headers: {
          cookie: signedCookie("admin@example.lt"),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Admin Meistras",
          phone: "+37061234567",
          categorySlugs: ["apdaila"],
          subcategorySlugs: ["dazymas", "glaistymas", "plyteles"],
          city: "Vilnius",
          operatingCities: ["Vilnius"],
          radius: 25
        })
      })
    );

    expect(response.status).toBe(200);
    expect(operations).toContainEqual(expect.objectContaining({
      table: "tradesperson_profiles",
      type: "insert",
      values: expect.objectContaining({ approval_status: "pending", public_status: "private" })
    }));
  });

  it("validates approval eligibility before approve", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installProfileWriteTables(operations, {
      tradesperson_profiles: [{
        id: "profile-id",
        display_name: "",
        company_name: null,
        phone: "12345",
        service_category_id: null,
        description: "Short",
        public_contact_consent_at: null,
        operating_areas: [],
        profile_services: [],
        profile_photos: []
      }]
    });

    const { PATCH } = await import("../app/api/admin/profiles/route");
    const response = await PATCH(adminPatchRequest({ id: "profile-id", action: "approve" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.validationErrors.length).toBeGreaterThan(0);
  });

  it("approves, suspends, and returns profiles to pending", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installProfileWriteTables(operations, {
      tradesperson_profiles: [{
        id: "profile-id",
        display_name: "Ready Profile",
        company_name: null,
        phone: "+37061234567",
        service_category_id: "cat-apdaila",
        description: "Pakankamai ilgas profilio aprasymas, kad patvirtinimo taisykles butu patenkintos ir profilis galetu buti publikuojamas.",
        public_contact_consent_at: "2026-07-16T05:00:00.000Z",
        operating_areas: [{ city: "Vilnius", radius_km: 25 }],
        profile_services: [{ service_subcategory_id: "a" }, { service_subcategory_id: "b" }, { service_subcategory_id: "c" }],
        profile_photos: []
      }]
    });

    const { PATCH } = await import("../app/api/admin/profiles/route");
    expect((await PATCH(adminPatchRequest({ id: "profile-id", action: "approve" }))).status).toBe(200);
    expect((await PATCH(adminPatchRequest({ id: "profile-id", action: "suspend" }))).status).toBe(200);
    expect((await PATCH(adminPatchRequest({ id: "profile-id", action: "return_pending" }))).status).toBe(200);
    expect(operations).toContainEqual(expect.objectContaining({ table: "tradesperson_profiles", type: "update", values: expect.objectContaining({ approval_status: "approved", public_status: "public" }) }));
    expect(operations).toContainEqual(expect.objectContaining({ table: "tradesperson_profiles", type: "update", values: { approval_status: "suspended", public_status: "private" } }));
    expect(operations).toContainEqual(expect.objectContaining({ table: "tradesperson_profiles", type: "update", values: { approval_status: "pending", public_status: "private" } }));
  });

  it("moderates photos and keeps public API privacy filtering", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installProfileWriteTables(operations, {
      profile_photos: [{ id: "photo-id", tradesperson_profile_id: "profile-id", moderation_status: "pending" }],
      tradesperson_profiles: [
        baseProfile,
        { ...baseProfile, id: "no-consent", public_contact_consent_at: null },
        { ...baseProfile, id: "private", public_status: "private" }
      ]
    });

    const { PATCH } = await import("../app/api/admin/profiles/route");
    const { GET } = await import("../app/api/specialists/route");
    const moderationResponse = await PATCH(adminPatchRequest({ id: "profile-id", action: "moderate_photo", photoId: "photo-id", moderationStatus: "approved" }));
    const publicResponse = await GET(new Request("http://localhost/api/specialists"));
    const publicData = await publicResponse.json();

    expect(moderationResponse.status).toBe(200);
    expect(operations).toContainEqual(expect.objectContaining({ table: "profile_photos", type: "update", values: { moderation_status: "approved", removed_from_profile_at: null } }));
    expect(publicData.specialists.map((profile: { id: string }) => profile.id)).toEqual(["consented-public"]);
  });
});
