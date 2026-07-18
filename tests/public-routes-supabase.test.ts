import { beforeEach, describe, expect, it, vi } from "vitest";
import { baseProfile } from "./helpers/fixtures";
import { adminPatchRequest } from "./helpers/requests";
import { installSupabaseMock } from "./helpers/supabase";

describe("public routes with mocked Supabase queries", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("../lib/supabase");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
    process.env.AUTH_SESSION_SECRET = "test-secret";
    process.env.ADMIN_EMAIL_ALLOWLIST = "admin@example.lt";
    delete process.env.LOCALPRO_SEED_MODE;
  });

  it("returns only approved public consented non-demo profiles in list routes", async () => {
    installSupabaseMock({
      tradesperson_profiles: [
        baseProfile,
        { ...baseProfile, id: "no-consent", public_contact_consent_at: null },
        { ...baseProfile, id: "pending", approval_status: "pending" },
        { ...baseProfile, id: "rejected", approval_status: "rejected" },
        { ...baseProfile, id: "suspended", approval_status: "suspended" },
        { ...baseProfile, id: "private", public_status: "private" },
        { ...baseProfile, id: "demo", is_demo: true }
      ]
    });

    const { GET } = await import("../app/api/specialists/route");
    const response = await GET(new Request("http://localhost/api/specialists"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.specialists.map((profile: { id: string }) => profile.id)).toEqual(["consented-public"]);
  });

  it("returns 404 for private and non-consented individual profiles", async () => {
    installSupabaseMock({
      tradesperson_profiles: [
        { ...baseProfile, id: "private", public_status: "private" },
        { ...baseProfile, id: "no-consent", public_contact_consent_at: null }
      ]
    });

    const { GET } = await import("../app/api/specialists/[id]/route");
    const privateResponse = await GET(new Request("http://localhost/api/specialists/private"), { params: Promise.resolve({ id: "private" }) });
    const nonConsentedResponse = await GET(new Request("http://localhost/api/specialists/no-consent"), { params: Promise.resolve({ id: "no-consent" }) });

    expect(privateResponse.status).toBe(404);
    expect(nonConsentedResponse.status).toBe(404);
  });

  it("excludes unapproved photos and private location fields from public output", async () => {
    installSupabaseMock({ tradesperson_profiles: [baseProfile] });

    const { GET } = await import("../app/api/specialists/route");
    const response = await GET(new Request("http://localhost/api/specialists"));
    const data = await response.json();
    const [profile] = data.specialists;

    expect(profile.photoUrls).toEqual(["https://example.lt/approved.jpg"]);
    expect(profile).not.toHaveProperty("registeredLat");
    expect(profile).not.toHaveProperty("registeredLng");
    expect(profile.lat).not.toBe(54.6872);
    expect(profile.lng).not.toBe(25.2797);
  });

  it("fails closed when Phase 1 migration columns are missing", async () => {
    vi.doMock("../lib/supabase", () => ({
      createServerSupabase: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  not: () => ({
                    order: () => Promise.resolve({ data: null, error: { message: "column tradesperson_profiles.public_contact_consent_at does not exist" } })
                  })
                })
              })
            })
          })
        })
      })
    }));

    const { GET } = await import("../app/api/specialists/route");
    const response = await GET(new Request("http://localhost/api/specialists"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.specialists).toEqual([]);
  });

  it("does not approve pending or rejected photos during normal admin profile save", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installSupabaseMock(
      {
        profile_photos: [
          { id: "pending-photo", tradesperson_profile_id: "profile-id", url: "https://example.lt/pending.jpg", moderation_status: "pending" },
          { id: "rejected-photo", tradesperson_profile_id: "profile-id", url: "https://example.lt/rejected.jpg", moderation_status: "rejected" },
          { id: "old-photo", tradesperson_profile_id: "profile-id", url: "https://example.lt/old.jpg", moderation_status: "approved" }
        ],
        admin_actions: []
      },
      operations
    );

    const { PATCH } = await import("../app/api/admin/profiles/route");
    const response = await PATCH(
      adminPatchRequest({
        id: "profile-id",
        action: "update",
        profile: {
          name: "Updated Name",
          photoUrls: [
            "https://example.lt/pending.jpg",
            "https://example.lt/rejected.jpg",
            "https://example.lt/new.jpg"
          ]
        }
      })
    );

    expect(response.status).toBe(200);
    expect(operations).not.toContainEqual(expect.objectContaining({ table: "profile_photos", values: expect.objectContaining({ moderation_status: "approved" }) }));
    expect(operations).toContainEqual(expect.objectContaining({ table: "profile_photos", type: "insert", values: expect.objectContaining({ url: "https://example.lt/new.jpg", moderation_status: "pending" }) }));
    expect(operations).toContainEqual(expect.objectContaining({ table: "profile_photos", type: "update", values: expect.objectContaining({ removed_from_profile_at: expect.any(String) }) }));
  });

  it("returns an admin-managed profile to pending and private", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installSupabaseMock({ tradesperson_profiles: [], admin_actions: [] }, operations);

    const { PATCH } = await import("../app/api/admin/profiles/route");
    const response = await PATCH(
      adminPatchRequest({
        id: "profile-id",
        action: "return_pending"
      })
    );

    expect(response.status).toBe(200);
    expect(operations).toContainEqual(expect.objectContaining({
      table: "tradesperson_profiles",
      type: "update",
      values: { approval_status: "pending", public_status: "private" }
    }));
    expect(operations).toContainEqual(expect.objectContaining({
      table: "admin_actions",
      type: "insert",
      values: expect.objectContaining({
        tradesperson_profile_id: "profile-id",
        action: "return_pending",
        created_by_role: "admin:admin@example.lt"
      })
    }));
  });

  it("records public contact consent with consent and admin audit rows", async () => {
    const operations: Array<Record<string, unknown>> = [];
    installSupabaseMock({ tradesperson_profiles: [], consent_logs: [], admin_actions: [] }, operations);

    const { PATCH } = await import("../app/api/admin/profiles/route");
    const response = await PATCH(
      adminPatchRequest({
        id: "profile-id",
        action: "record_public_contact_consent",
        consentChannel: "whatsapp",
        consentText: "Specialist explicitly agreed that selected contact details may be displayed publicly on LocalPro.",
        capturedAt: "2026-07-16T06:30:00.000Z",
        evidenceReference: "wa:conversation-123/message-456"
      })
    );

    expect(response.status).toBe(200);
    expect(operations).toContainEqual(expect.objectContaining({
      table: "tradesperson_profiles",
      type: "update",
      values: { public_contact_consent_at: "2026-07-16T06:30:00.000Z" }
    }));
    expect(operations).toContainEqual(expect.objectContaining({
      table: "consent_logs",
      type: "insert",
      values: expect.objectContaining({
        tradesperson_profile_id: "profile-id",
        consent_type: "public_contact_display",
        captured_channel: "whatsapp",
        evidence_reference: "wa:conversation-123/message-456",
        captured_by_role: "admin:admin@example.lt"
      })
    }));
    expect(operations).toContainEqual(expect.objectContaining({
      table: "admin_actions",
      type: "insert",
      values: expect.objectContaining({
        tradesperson_profile_id: "profile-id",
        action: "record_public_contact_consent",
        created_by_role: "admin:admin@example.lt"
      })
    }));
  });
});
