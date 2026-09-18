import { describe, expect, it } from "vitest";
import { contactUpdatesFromImport, previewContactImport } from "../lib/marketing/import-service";

const mapping = { name: "Name", phone: "Phone", email: "Email", trade: "Trade", area: "Area" };

describe("marketing contact import", () => {
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

