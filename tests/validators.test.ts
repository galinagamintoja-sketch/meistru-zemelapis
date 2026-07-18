import { describe, expect, it } from "vitest";
import { isLithuanianPhone, normalizeLithuanianPhone, registrationSchema } from "../lib/validators";
import { validRegistration } from "./helpers/fixtures";

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
