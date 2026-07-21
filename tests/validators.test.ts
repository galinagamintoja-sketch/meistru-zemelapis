import { describe, expect, it } from "vitest";
import { isLithuanianPhone, jobRequestSchema, normalizeLithuanianPhone, registrationSchema } from "../lib/validators";

const validRegistration = {
  name: "Test Meistras",
  phone: "+37061234567",
  email: "test@example.lt",
  address: "Gedimino pr. 1, Vilnius, Lithuania",
  placeId: "test-place-id",
  latitude: 54.6872,
  longitude: 25.2797,
  town: "Vilnius",
  street: "Gedimino pr.",
  postcode: "01103",
  trade: "Apdaila",
  categorySlugs: ["apdaila"],
  subcategorySlugs: ["dazymas"],
  description: "Testinis meistro profilio aprasymas validacijai.",
  travelRange: "25",
  photoUrls: [],
  photoUploads: [],
  consentAccepted: true,
  termsAccepted: true,
  privacyAcknowledged: true,
  publicContactConsent: true
};

describe("registration validation", () => {
  it("accepts a valid Lithuanian registration payload", () => {
    expect(registrationSchema.safeParse(validRegistration).success).toBe(true);
  });

  it("rejects invalid Lithuanian phone numbers", () => {
    expect(isLithuanianPhone("+37061234567")).toBe(true);
    expect(normalizeLithuanianPhone("861234567")).toBe("+37061234567");
    expect(registrationSchema.safeParse({ ...validRegistration, phone: "12345" }).success).toBe(false);
  });

  it("requires terms, privacy, and public contact consent", () => {
    expect(registrationSchema.safeParse({ ...validRegistration, consentAccepted: false, termsAccepted: false }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...validRegistration, consentAccepted: false, privacyAcknowledged: false }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...validRegistration, consentAccepted: false, publicContactConsent: false }).success).toBe(false);
  });

  it("does not accept the legacy bundled consent as separate required consent", () => {
    expect(
      registrationSchema.safeParse({
        ...validRegistration,
        consentAccepted: true,
        termsAccepted: false,
        privacyAcknowledged: false,
        publicContactConsent: false
      }).success
    ).toBe(false);
  });
});

describe("homeowner job request validation", () => {
  const request = {
    categorySlug: "apdaila",
    subcategorySlug: "dazymas",
    address: "Trakų g. 10, Lentvaris",
    placeId: "lt-place",
    latitude: 54.64,
    longitude: 25.05,
    town: "Lentvaris",
    description: "Reikia perdažyti du kambarius ir sutvarkyti sienų įtrūkimus.",
    urgency: "within_week",
    preferredContactMethod: "phone",
    clientName: "Test Client",
    clientPhone: "+37061234567",
    clientEmail: "",
    photoUploads: [],
    privacyConsent: true
  };

  it("accepts the private job request minimum", () => {
    expect(jobRequestSchema.safeParse(request).success).toBe(true);
  });

  it("requires privacy consent and the selected contact channel", () => {
    expect(jobRequestSchema.safeParse({ ...request, privacyConsent: false }).success).toBe(false);
    expect(jobRequestSchema.safeParse({ ...request, clientPhone: "" }).success).toBe(false);
    expect(jobRequestSchema.safeParse({ ...request, preferredContactMethod: "email", clientPhone: "", clientEmail: "" }).success).toBe(false);
  });
});
