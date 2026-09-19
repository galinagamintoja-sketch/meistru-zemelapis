import { describe, expect, it } from "vitest";
import { contactUpdatesFromImport, previewContactImport } from "../lib/marketing/import-service";
import { normalizeMarketingEmail, normalizeMarketingPhone } from "../lib/marketing/normalization";

const mapping = { name: "Name", phone: "Phone", email: "Email", trade: "Trade", area: "Area" };

describe("marketing contact import", () => {
  it.each([
    ["+370 612 34567", "+37061234567"],
    ["37061234567", "+37061234567"],
    ["0 612 34567", "+37061234567"],
    ["8 612 34567", "+37061234567"],
    ["+44 20 7946 0018", "+442079460018"]
  ])("normalizes %s without forcing foreign numbers to Lithuania", (input, expected) => {
    expect(normalizeMarketingPhone(input)).toBe(expected);
  });

  it("normalizes email candidates without Gmail-specific rewriting", () => {
    expect(normalizeMarketingEmail("  First.Last+work@EXAMPLE.LT  ")).toBe("first.last+work@example.lt");
    expect(normalizeMarketingEmail("firstlast@example.lt")).not.toBe(normalizeMarketingEmail("first.last@example.lt"));
    expect(normalizeMarketingEmail("first@example.lt")).not.toBe(normalizeMarketingEmail("first+work@example.lt"));
  });

  it("preserves original phone and email values alongside normalized candidates", () => {
    const [row] = previewContactImport([
      { Name: "A", Phone: " +370 612 34567 ", Email: " First.Last+work@EXAMPLE.LT " }
    ], mapping);
    expect(row.values).toMatchObject({
      phoneRaw: "+370 612 34567",
      phoneNormalized: "+37061234567",
      emailRaw: "First.Last+work@EXAMPLE.LT",
      emailNormalized: "first.last+work@example.lt"
    });
  });

  it("normalizes legacy and current Lithuanian phone formats", () => {
    const result = previewContactImport([
      { Name: "A", Phone: "8 612 34567" }, { Name: "B", Phone: "0 623 45678" }, { Name: "C", Phone: "+370 634 56789" }
    ], mapping);
    expect(result.map((row) => row.values.phoneNormalized)).toEqual(["+37061234567", "+37062345678", "+37063456789"]);
  });

  it("recognizes the same workbook row on repeat import", () => {
    const rows = [{ Name: "Jonas", Phone: "+37061234567", Email: "Jonas@Example.LT" }];
    expect(previewContactImport(rows, mapping)[0].outcome).toBe("new");
    const repeated = previewContactImport(rows, mapping, [
      { contactId: "contact-1", type: "phone", normalizedValue: "+37061234567" },
      { contactId: "contact-1", type: "email", normalizedValue: "jonas@example.lt" }
    ]);
    expect(repeated[0]).toMatchObject({ outcome: "existing_contact", contactId: "contact-1" });
  });

  it("matches exact phone or exact email independently", () => {
    const identities = [
      { contactId: "phone-owner", type: "phone" as const, normalizedValue: "+37061234567" },
      { contactId: "email-owner", type: "email" as const, normalizedValue: "known@example.lt" }
    ];
    expect(previewContactImport([{ Name: "A", Phone: "861234567" }], mapping, identities)[0].contactId).toBe("phone-owner");
    expect(previewContactImport([{ Name: "B", Email: "KNOWN@example.lt" }], mapping, identities)[0].contactId).toBe("email-owner");
  });

  it("quarantines a phone/email split across two contacts", () => {
    const result = previewContactImport([{ Name: "Conflict", Phone: "861234567", Email: "other@example.lt" }], mapping, [
      { contactId: "a", type: "phone", normalizedValue: "+37061234567" },
      { contactId: "b", type: "email", normalizedValue: "other@example.lt" }
    ]);
    expect(result[0].outcome).toBe("conflict");
    expect(result[0].reasons).toContain("phone_email_different_contacts");
  });

  it("quarantines a shared or recycled endpoint with multiple owners", () => {
    const result = previewContactImport([{ Name: "Unknown owner", Phone: "861234567" }], mapping, [
      { contactId: "a", type: "phone", normalizedValue: "+37061234567" },
      { contactId: "b", type: "phone", normalizedValue: "+37061234567" }
    ]);
    expect(result[0]).toMatchObject({ outcome: "conflict", reasons: ["identity_has_multiple_owners"] });
  });

  it("does not miss a candidate among more than 1,000 existing identities", () => {
    const identities = Array.from({ length: 1200 }, (_, index) => ({ contactId: `contact-${index}`, type: "email" as const, normalizedValue: `person${index}@example.lt` }));
    expect(previewContactImport([{ Name: "Known", Email: "person1199@example.lt" }], mapping, identities)[0])
      .toMatchObject({ outcome: "existing_contact", contactId: "contact-1199" });
  });

  it("preserves a repeated contact row as another source instead of a conflict", () => {
    const sourceMapping = { ...mapping, groupUrl: "Group", postUrl: "Post" };
    const rows = previewContactImport([
      { Name: "Jonas", Phone: "861234567", Group: "https://facebook.com/groups/a", Post: "https://facebook.com/posts/1" },
      { Name: "Jonas", Phone: "861234567", Group: "https://facebook.com/groups/b", Post: "https://facebook.com/posts/2" }
    ], sourceMapping);
    expect(rows.map((row) => row.outcome)).toEqual(["new", "existing_contact"]);
    expect(rows[1].reasons).toContain("duplicate_within_import_source_preserved");
  });

  it("preserves invalid endpoint evidence when the other endpoint is valid", () => {
    const [badEmail] = previewContactImport([{ Name: "A", Phone: "861234567", Email: "not-email" }], mapping);
    const [badPhone] = previewContactImport([{ Name: "B", Phone: "123", Email: "b@example.lt" }], mapping);
    expect(badEmail).toMatchObject({ outcome: "new", values: { emailRaw: "not-email", emailNormalized: null } });
    expect(badEmail.reasons).toContain("invalid_email");
    expect(badPhone).toMatchObject({ outcome: "new", values: { phoneRaw: "123", phoneNormalized: null } });
    expect(badPhone.reasons).toContain("invalid_phone");
  });

  it("marks a row invalid without a usable identity", () => {
    const result = previewContactImport([{ Name: "Same Name", Trade: "Painter", Area: "Vilnius", Phone: "123" }], mapping);
    expect(result[0].outcome).toBe("invalid");
    expect(result[0].reasons).toContain("no_valid_identity");
  });

  it("does not overwrite values with blanks or protected fields", () => {
    expect(contactUpdatesFromImport({ company: "", trade: "", area: "" }, [])).toEqual({});
    expect(contactUpdatesFromImport({ company: "New Co", trade: "Painter", area: "Kaunas" }, ["trade", "area"]))
      .toEqual({ company_name: "New Co" });
  });
});
