import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const baseProfile = {
  id: "consented-public",
  display_name: "Consented Public",
  company_name: null,
  phone: "+37061234567",
  whatsapp_number: null,
  email: "public@localpro.lt",
  base_city: "Vilnius",
  radius_km: 25,
  latitude: 54.6872,
  longitude: 25.2797,
  description: "Pakankamai ilgas aprasymas viesam specialistu profilio testui.",
  review_score: null,
  review_count: null,
  verification_labels: [],
  public_status: "public",
  approval_status: "approved",
  is_demo: false,
  public_contact_consent_at: "2026-07-16T05:00:00.000Z",
  source: "self-registration",
  service_area_label: null,
  service_categories: { name: "Apdaila", slug: "apdaila" },
  profile_services: [],
  operating_areas: [{ city: "Vilnius", radius_km: 25 }],
  profile_photos: [
    { id: "approved-photo", label: "Approved", url: "https://example.lt/approved.jpg", moderation_status: "approved", sort_order: 1, removed_from_profile_at: null },
    { id: "pending-photo", label: "Pending", url: "https://example.lt/pending.jpg", moderation_status: "pending", sort_order: 2, removed_from_profile_at: null },
    { id: "rejected-photo", label: "Rejected", url: "https://example.lt/rejected.jpg", moderation_status: "rejected", sort_order: 3, removed_from_profile_at: null }
  ],
  reviews: []
};

function signedCookie(email: string) {
  const session = {
    email,
    name: email,
    googleSub: "test-google-sub",
    expiresAt: Date.now() + 60_000
  };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.AUTH_SESSION_SECRET ?? "").update(payload).digest("base64url");
  return `localpro-login-session=${payload}.${signature}`;
}

class QueryBuilder {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];

  constructor(
    private table: string,
    private rows: Record<string, unknown>[],
    private operations: Array<Record<string, unknown>>
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.filters.push((row) => row[column] !== null && row[column] !== undefined);
    }
    return this;
  }

  order() {
    return this;
  }

  update(values: Record<string, unknown>) {
    this.operations.push({ table: this.table, type: "update", values });
    return this;
  }

  insert(values: unknown) {
    this.operations.push({ table: this.table, type: "insert", values });
    return this;
  }

  single() {
    const data = this.filteredRows()[0] ?? null;
    return Promise.resolve({ data, error: data ? null : { message: "No rows" } });
  }

  then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.filteredRows(), error: null }).then(resolve);
  }

  private filteredRows() {
    return this.rows.filter((row) => this.filters.every((filter) => filter(row)));
  }
}

function installSupabaseMock(tables: Record<string, Record<string, unknown>[]>, operations: Array<Record<string, unknown>> = []) {
  vi.doMock("../lib/supabase", () => ({
    createServerSupabase: () => ({
      from: (table: string) => new QueryBuilder(table, tables[table] ?? [], operations)
    })
  }));
}

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
      new Request("http://localhost/api/admin/profiles", {
        method: "PATCH",
        headers: {
          cookie: signedCookie("admin@example.lt"),
          "content-type": "application/json"
        },
        body: JSON.stringify({
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
      new Request("http://localhost/api/admin/profiles", {
        method: "PATCH",
        headers: {
          cookie: signedCookie("admin@example.lt"),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: "profile-id",
          action: "return_pending"
        })
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
      new Request("http://localhost/api/admin/profiles", {
        method: "PATCH",
        headers: {
          cookie: signedCookie("admin@example.lt"),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: "profile-id",
          action: "record_public_contact_consent",
          consentChannel: "whatsapp",
          consentText: "Specialist explicitly agreed that selected contact details may be displayed publicly on LocalPro.",
          capturedAt: "2026-07-16T06:30:00.000Z",
          evidenceReference: "wa:conversation-123/message-456"
        })
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
