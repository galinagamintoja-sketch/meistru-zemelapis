import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validRegistration = {
  name: "Test Meistras",
  phone: "+37061234567",
  email: "test@example.lt",
  city: "Vilnius",
  trade: "Apdaila",
  categorySlugs: ["apdaila"],
  subcategorySlugs: ["dazymas"],
  description: "Testinis meistro profilio aprasymas validacijai.",
  radiusKm: 25,
  operatingCities: ["Vilnius"],
  photoUrls: [],
  photoUploads: [],
  consentAccepted: true
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
    const response = await POST(
      new Request("http://localhost/api/tradesperson/register", {
        method: "POST",
        body: JSON.stringify(validRegistration)
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile.approvalStatus).toBe("pending");
  });

  it("rejects invalid profile creation payloads", async () => {
    const { POST } = await import("../app/api/tradesperson/register/route");
    const response = await POST(
      new Request("http://localhost/api/tradesperson/register", {
        method: "POST",
        body: JSON.stringify({ ...validRegistration, phone: "12345" })
      })
    );

    expect(response.status).toBe(400);
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

  it("allows admin profile access for allowlisted Google email", async () => {
    const { GET } = await import("../app/api/admin/profiles/route");
    const response = await GET(
      new Request("http://localhost/api/admin/profiles?status=all", {
        headers: { cookie: signedCookie("admin@example.lt") }
      })
    );

    expect(response.status).toBe(200);
  });
});
