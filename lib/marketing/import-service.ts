import type {
  ExistingIdentity,
  ImportInputRow,
  ImportMapping,
  ImportPreviewRow,
} from "./types";
import {
  emailInvalidReason,
  normalizeMarketingEmail,
  normalizeMarketingPhone,
  normalizedIdentityKey,
  phoneInvalidReason,
  textValue,
} from "./normalization";

function mapped(
  row: ImportInputRow,
  mapping: ImportMapping,
  field: keyof ImportMapping,
) {
  const column = mapping[field];
  return column ? textValue(row[column]) : "";
}

export function previewContactImport(
  rows: ImportInputRow[],
  mapping: ImportMapping,
  existingIdentities: ExistingIdentity[] = [],
): ImportPreviewRow[] {
  const identityOwners = new Map<string, Set<string>>();
  for (const identity of existingIdentities) {
    const key = normalizedIdentityKey(identity.type, identity.normalizedValue);
    const owners = identityOwners.get(key) ?? new Set<string>();
    owners.add(identity.contactId);
    identityOwners.set(key, owners);
  }
  const batchOwners = new Map<string, { row: number; signature: string }>();

  return rows.map((row, index) => {
    const phoneRaw = mapped(row, mapping, "phone");
    const emailRaw = mapped(row, mapping, "email");
    const phoneNormalized = normalizeMarketingPhone(phoneRaw);
    const emailNormalized = normalizeMarketingEmail(emailRaw);
    const name = mapped(row, mapping, "name");
    const reasons: string[] = [];
    const phoneOwners = phoneNormalized
      ? (identityOwners.get(normalizedIdentityKey("phone", phoneNormalized)) ??
        new Set<string>())
      : new Set<string>();
    const emailOwners = emailNormalized
      ? (identityOwners.get(normalizedIdentityKey("email", emailNormalized)) ??
        new Set<string>())
      : new Set<string>();
    const phoneBatchRow = phoneNormalized
      ? batchOwners.get(normalizedIdentityKey("phone", phoneNormalized))
      : undefined;
    const emailBatchRow = emailNormalized
      ? batchOwners.get(normalizedIdentityKey("email", emailNormalized))
      : undefined;
    const owners = new Set([...phoneOwners, ...emailOwners]);
    const signature = `${name.trim().toLowerCase()}|${phoneNormalized ?? ""}|${emailNormalized ?? ""}`;
    let outcome: ImportPreviewRow["outcome"] = "new";
    let contactId: string | undefined;

    if (!name) reasons.push("missing_name");
    if (!phoneNormalized && !emailNormalized) reasons.push("no_valid_identity");
    if (phoneInvalidReason(phoneRaw)) reasons.push("invalid_phone");
    if (emailInvalidReason(emailRaw)) reasons.push("invalid_email");

    if (
      reasons.includes("missing_name") ||
      reasons.includes("no_valid_identity")
    ) {
      outcome = "invalid";
    } else if (phoneOwners.size > 1 || emailOwners.size > 1) {
      outcome = "conflict";
      reasons.push("identity_has_multiple_owners");
    } else if (owners.size > 1) {
      outcome = "conflict";
      reasons.push("phone_email_different_contacts");
    } else if (
      (phoneBatchRow && phoneBatchRow.signature !== signature) ||
      (emailBatchRow && emailBatchRow.signature !== signature)
    ) {
      outcome = "needs_review";
      reasons.push("duplicate_within_import_has_different_identity_data");
    } else if (phoneBatchRow || emailBatchRow) {
      outcome = "existing_contact";
      reasons.push("duplicate_within_import_source_preserved");
    } else if (owners.size === 1) {
      contactId = [...owners][0];
      const introducesIdentity = Boolean(
        (phoneNormalized && phoneOwners.size === 0) ||
          (emailNormalized && emailOwners.size === 0),
      );
      outcome = introducesIdentity ? "needs_review" : "existing_contact";
      if (introducesIdentity) reasons.push("new_identity_requires_review");
    }

    if (phoneNormalized)
      batchOwners.set(normalizedIdentityKey("phone", phoneNormalized), {
        row: index + 2,
        signature,
      });
    if (emailNormalized)
      batchOwners.set(normalizedIdentityKey("email", emailNormalized), {
        row: index + 2,
        signature,
      });

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
        sourceDate:
          sourceDateParsed && !Number.isNaN(sourceDateParsed.valueOf())
            ? sourceDateParsed.toISOString()
            : null,
      },
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
  manuallyCorrectedFields: string[],
) {
  const protectedFields = new Set(manuallyCorrectedFields);
  const updates: Record<string, string> = {};
  if (values.company && !protectedFields.has("company_name"))
    updates.company_name = values.company;
  if (values.trade && !protectedFields.has("trade"))
    updates.trade = values.trade;
  if (values.area && !protectedFields.has("area")) updates.area = values.area;
  return updates;
}
