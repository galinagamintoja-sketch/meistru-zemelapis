import { describe, expect, it } from "vitest";
import { isLithuanianPhone, normalizeLithuanianPhone, registrationSchema } from "../lib/validators";

const validRegistration = {
  name: "Test Meistras",
  phone: "+37061234567",
  email: "test@example.lt",
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
  consentAccepted: true
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

  it("requires GDPR consent", () => {
    expect(registrationSchema.safeParse({ ...validRegistration, consentAccepted: false }).success).toBe(false);
  });
});
