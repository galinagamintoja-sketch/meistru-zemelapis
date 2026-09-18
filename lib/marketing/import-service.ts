import type { ExistingIdentity, ImportInputRow, ImportMapping, ImportPreviewRow } from "./types";
import { normalizeMarketingEmail, normalizeMarketingPhone, normalizedIdentityKey, textValue } from "./normalization";

function mapped(row: ImportInputRow, mapping: ImportMapping, field: keyof ImportMapping) {
  const column = mapping[field];
  return column ? textValue(row[column]) : "";
}

export function previewContactImport(
  rows: ImportInputRow[],
  mapping: ImportMapping,
  existingIdentities: ExistingIdentity[] = []
): ImportPreviewRow[] {
  const identityOwners = new Map(existingIdentities.map((identity) => [
    normalizedIdentityKey(identity.type, identity.normalizedValue), identity.contactId
  ]));
  const batchOwners = new Map<string, number>();

  return rows.map((row, index) => {
    const phoneRaw = mapped(row, mapping, "phone");
    const emailRaw = mapped(row, mapping, "email");
    const phoneNormalized = normalizeMarketingPhone(phoneRaw);
    const emailNormalized = normalizeMarketingEmail(emailRaw);
    const name = mapped(row, mapping, "name");
    const reasons: string[] = [];
    const phoneOwner = phoneNormalized ? identityOwners.get(normalizedIdentityKey("phone", phoneNormalized)) : undefined;
    const emailOwner = emailNormalized ? identityOwners.get(normalizedIdentityKey("email", emailNormalized)) : undefined;
    const phoneBatchRow = phoneNormalized ? batchOwners.get(normalizedIdentityKey("phone", phoneNormalized)) : undefined;
    const emailBatchRow = emailNormalized ? batchOwners.get(normalizedIdentityKey("email", emailNormalized)) : undefined;
    let outcome: ImportPreviewRow["outcome"] = "new";
    let contactId: string | undefined;

    if (!name) reasons.push("missing_name");
    if (!phoneNormalized && !emailNormalized) reasons.push("no_valid_identity");
    if (phoneRaw && !phoneNormalized) reasons.push("invalid_phone");
    if (emailRaw && !emailNormalized) reasons.push("invalid_email");

    if (reasons.includes("missing_name") || reasons.includes("no_valid_identity")) {
      outcome = "invalid";
    } else if (phoneOwner && emailOwner && phoneOwner !== emailOwner) {
      outcome = "conflict";
      reasons.push("phone_email_different_contacts");
    } else if (phoneBatchRow !== undefined || emailBatchRow !== undefined) {
      outcome = "conflict";
      reasons.push("duplicate_within_import");
    } else if (phoneOwner || emailOwner) {
      contactId = phoneOwner ?? emailOwner;
      outcome = phoneNormalized && emailNormalized && (!phoneOwner || !emailOwner) ? "update_existing" : "existing_contact";
    }

    if (phoneNormalized) batchOwners.set(normalizedIdentityKey("phone", phoneNormalized), index + 2);
    if (emailNormalized) batchOwners.set(normalizedIdentityKey("email", emailNormalized), index + 2);

    const sourceDateRaw = mapped(row, mapping, "sourceDate");
    const sourceDateParsed = sourceDateRaw ? new Date(sourceDateRaw) : null;
    return {
      rowNumber: index + 2,
      outcome,
      contactId,
      reasons,
      values: {
        name,
        company: mapped(row, mapping, "company"),
        trade: mapped(row, mapping, "trade"),
        area: mapped(row, mapping, "area"),
        phoneRaw,
        phoneNormalized,
        emailRaw,
        emailNormalized,
        sourceUrl: mapped(row, mapping, "sourceUrl"),
        groupUrl: mapped(row, mapping, "groupUrl"),
        postUrl: mapped(row, mapping, "postUrl"),
        sourceDate: sourceDateParsed && !Number.isNaN(sourceDateParsed.valueOf()) ? sourceDateParsed.toISOString() : null
      }
    };
  });
}

export function importSummary(rows: ImportPreviewRow[]) {
  return rows.reduce<Record<string, number>>((summary, row) => {
    summary[row.outcome] = (summary[row.outcome] ?? 0) + 1;
    return summary;
  }, {});
}

export function contactUpdatesFromImport(
  values: Pick<ImportPreviewRow["values"], "company" | "trade" | "area">,
  manuallyCorrectedFields: string[]
) {
  const protectedFields = new Set(manuallyCorrectedFields);
  const updates: Record<string, string> = {};
  if (values.company && !protectedFields.has("company_name")) updates.company_name = values.company;
  if (values.trade && !protectedFields.has("trade")) updates.trade = values.trade;
  if (values.area && !protectedFields.has("area")) updates.area = values.area;
  return updates;
}
