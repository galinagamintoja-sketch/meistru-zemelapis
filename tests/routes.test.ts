import { beforeEach, describe, expect, it, vi } from "vitest";
import { validRegistration } from "./helpers/fixtures";
import { adminPatchRequest, registrationPostRequest, signedCookie } from "./helpers/requests";

describe("profile API routes", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.AUTH_SESSION_SECRET = "test-secret";
    process.env.ADMIN_EMAIL_ALLOWLIST = "admin@example.lt";
    process.env.LOCALPRO_SEED_MODE = "true";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("creates a pending profile in explicit local seed mode", async () => {
    const { POST } = await import("../app/api/tradesperson/register/route");
    const response = await POST(registrationPostRequest(validRegistration));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile.approvalStatus).toBe("pending");
  });

  it("rejects invalid profile creation payloads", async () => {
    const { POST } = await import("../app/api/tradesperson/register/route");
    const response = await POST(registrationPostRequest({ ...validRegistration, phone: "12345" }));

    expect(response.status).toBe(400);
  });

  it("resolves known Lithuanian locations without exposing the Google key", async () => {
    const { GET } = await import("../app/api/geo/resolve/route");
    const response = await GET(new Request("http://localhost/api/geo/resolve?location=Vilnius"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.coordinates.lat).toBeCloseTo(54.6872, 3);
    expect(data.coordinates.lng).toBeCloseTo(25.2797, 3);
  });

  it("returns field-level validation details for bad registrations", async () => {
    const { POST } = await import("../app/api/tradesperson/register/route");
    const response = await POST(
      registrationPostRequest({
        ...validRegistration,
        name: "",
        phone: "12345",
        email: "not-an-email",
        address: "",
        town: "",
        street: "",
        postcode: "",
        consentAccepted: false,
        termsAccepted: false,
        privacyAcknowledged: false,
        publicContactConsent: false
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.details.fieldErrors.name.length).toBeGreaterThan(0);
    expect(data.details.fieldErrors.phone.length).toBeGreaterThan(0);
    expect(data.details.fieldErrors.email.length).toBeGreaterThan(0);
    expect(data.details.fieldErrors.address.length).toBeGreaterThan(0);
    expect(data.details.fieldErrors.termsAccepted.length).toBeGreaterThan(0);
    expect(data.details.fieldErrors.privacyAcknowledged.length).toBeGreaterThan(0);
    expect(data.details.fieldErrors.publicContactConsent.length).toBeGreaterThan(0);
  });

  it("rejects registrations that only send the legacy bundled consent", async () => {
    const { POST } = await import("../app/api/tradesperson/register/route");
    const response = await POST(
      registrationPostRequest({
        ...validRegistration,
        consentAccepted: true,
        termsAccepted: false,
        privacyAcknowledged: false,
        publicContactConsent: false
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.details.fieldErrors.termsAccepted.length).toBeGreaterThan(0);
    expect(data.details.fieldErrors.privacyAcknowledged.length).toBeGreaterThan(0);
    expect(data.details.fieldErrors.publicContactConsent.length).toBeGreaterThan(0);
  });

  it("rejects admin profile access without an admin session", async () => {
    const { GET } = await import("../app/api/admin/profiles/route");

    const anonymous = await GET(new Request("http://localhost/api/admin/profiles"));
    const nonAdmin = await GET(
      new Request("http://localhost/api/admin/profiles", {
        headers: { cookie: signedCookie("not-admin@example.lt") }
      })
    );

    expect(anonymous.status).toBe(401);
    expect(nonAdmin.status).toBe(401);
  });

  it("accepts a private homeowner request in explicit local seed mode", async () => {
    const { POST } = await import("../app/api/job-requests/route");
    const response = await POST(new Request("http://localhost/api/job-requests", { method: "POST", body: JSON.stringify(validJobRequest) }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.requestId).toMatch(/^request-/);
  });

  it("accepts every service returned by the categories API with its displayed parent category", async () => {
    const { GET } = await import("../app/api/categories/route");
    const { POST } = await import("../app/api/job-requests/route");
    const categoriesResponse = await GET();
    const { categories } = await categoriesResponse.json();

    for (const category of categories) {
      for (const subcategory of category.subcategories) {
        const response = await POST(new Request("http://localhost/api/job-requests", {
          method: "POST",
          body: JSON.stringify({
            ...validJobRequest,
            categorySlug: category.slug,
            subcategorySlug: subcategory.slug
          })
        }));

        expect(response.status, `${category.slug}/${subcategory.slug}`).toBe(200);
      }
    }
  });

  it("rejects a service submitted with a different displayed parent category", async () => {
    const { POST } = await import("../app/api/job-requests/route");
    const response = await POST(new Request("http://localhost/api/job-requests", {
      method: "POST",
      body: JSON.stringify({ ...validJobRequest, categorySlug: "elektra", subcategorySlug: "dazymas" })
    }));

    expect(response.status).toBe(400);
  });

  it("keeps homeowner requests behind admin authentication", async () => {
    const { GET } = await import("../app/api/admin/job-requests/route");
    const anonymous = await GET(new Request("http://localhost/api/admin/job-requests"));
    const nonAdmin = await GET(new Request("http://localhost/api/admin/job-requests", { headers: { cookie: signedCookie("not-admin@example.lt") } }));
    expect(anonymous.status).toBe(401);
    expect(nonAdmin.status).toBe(401);
  });

  it("allows admin profile access for allowlisted Google email", async () => {
    const { GET } = await import("../app/api/admin/profiles/route");
    const response = await GET(
      new Request("http://localhost/api/admin/profiles?status=all", {
        headers: { cookie: signedCookie("admin@example.lt") }
      })
    );

    expect(response.status).toBe(200);
  });

  it("rejects destructive admin delete actions", async () => {
    const { PATCH } = await import("../app/api/admin/profiles/route");
    const response = await PATCH(adminPatchRequest({ id: "test-profile-id", action: "delete" }));

    expect(response.status).toBe(400);
  });
});
