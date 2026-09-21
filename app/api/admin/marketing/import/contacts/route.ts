import { NextResponse } from "next/server";
import { requireMarketingImportAccess } from "../../../../../../lib/marketing/authorization";
import {
  importSummary,
  previewContactImport,
} from "../../../../../../lib/marketing/import-service";
import { parseContactSpreadsheet } from "../../../../../../lib/marketing/spreadsheet";
import type {
  ExistingIdentity,
  ImportInputRow,
  ImportMapping,
  ImportPreviewRow,
} from "../../../../../../lib/marketing/types";
import { createMarketingServerSupabase } from "../../../../../../lib/marketing/supabase";
import { z } from "zod";
import {
  normalizeMarketingEmail,
  normalizeMarketingPhone,
} from "../../../../../../lib/marketing/normalization";
import type { ImportErrorReportRow } from "../../../../../../lib/marketing/types";

const mappingSchema = z
  .record(z.string(), z.string().min(1))
  .refine((value) => !value.name || typeof value.name === "string");
const jsonImportSchema = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())).max(5000).optional(),
    contact: z.record(z.string(), z.unknown()).optional(),
    mapping: mappingSchema.optional(),
    commit: z.boolean().optional(),
    fileName: z.string().trim().min(1).max(255).optional(),
  })
  .refine(
    (value) => Boolean(value.rows?.length || value.contact),
    "No contact rows found",
  );

function inferMapping(headers: string[]): ImportMapping {
  const aliases: Record<keyof ImportMapping, string[]> = {
    name: ["name", "vardas", "pavadinimas"],
    company: ["company", "įmonė", "imone"],
    trade: ["trade", "profession", "specialybė", "specialybe"],
    area: ["area", "city", "miestas", "vieta"],
    phone: ["phone", "telefonas", "tel"],
    email: ["email", "el. paštas", "el pastas"],
    sourceUrl: ["source url", "source", "šaltinis", "saltinis"],
    groupUrl: ["group url", "group", "grupė", "grupe"],
    postUrl: ["post url", "post", "įrašas", "irasas"],
    sourceDate: ["source date", "date", "data"],
  };
  const normalized = new Map(
    headers.map((header) => [header.trim().toLowerCase(), header]),
  );
  return Object.fromEntries(
    Object.entries(aliases).flatMap(([field, names]) => {
      const header = names.map((name) => normalized.get(name)).find(Boolean);
      return header ? [[field, header]] : [];
    }),
  ) as ImportMapping;
}

function candidateValues(rows: ImportInputRow[], mapping: ImportMapping) {
  const phoneColumn = mapping.phone;
  const emailColumn = mapping.email;
  return {
    phones: [
      ...new Set(
        rows
          .map((row) =>
            phoneColumn ? normalizeMarketingPhone(row[phoneColumn]) : null,
          )
          .filter((v): v is string => Boolean(v)),
      ),
    ],
    emails: [
      ...new Set(
        rows
          .map((row) =>
            emailColumn ? normalizeMarketingEmail(row[emailColumn]) : null,
          )
          .filter((v): v is string => Boolean(v)),
      ),
    ],
  };
}

async function existingIdentities(
  rows: ImportInputRow[],
  mapping: ImportMapping,
): Promise<ExistingIdentity[]> {
  const supabase = createMarketingServerSupabase();
  const candidates = candidateValues(rows, mapping);
  const found: ExistingIdentity[] = [];
  for (const [type, values] of [
    ["phone", candidates.phones],
    ["email", candidates.emails],
  ] as const) {
    for (let offset = 0; offset < values.length; offset += 200) {
      const { data, error } = await supabase
        .from("marketing_contact_identities")
        .select("contact_id,identity_type,normalized_value")
        .eq("identity_type", type)
        .eq("is_valid", true)
        .in("normalized_value", values.slice(offset, offset + 200));
      if (error) throw new Error("identity_lookup_failed");
      found.push(
        ...(data ?? []).map((row) => ({
          contactId: row.contact_id,
          type: row.identity_type as "phone" | "email",
          normalizedValue: row.normalized_value,
        })),
      );
    }
  }
  return found;
}

function errorReport(
  rows: ImportPreviewRow[],
  results?: Array<{ rowNumber: number; status: string; error?: string }>,
): ImportErrorReportRow[] {
  const resultByRow = new Map(
    results?.map((result) => [result.rowNumber, result]),
  );
  return rows
    .filter((row) =>
      ["invalid", "conflict", "needs_review"].includes(
        resultByRow.get(row.rowNumber)?.status ?? row.outcome,
      ),
    )
    .map((row) => ({
      row: row.rowNumber,
      result: resultByRow.get(row.rowNumber)?.status ?? row.outcome,
      name: row.values.name,
      phone: row.values.phoneRaw,
      email: row.values.emailRaw,
      reason: resultByRow.get(row.rowNumber)?.error ?? row.reasons.join("; "),
    }));
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const access = await requireMarketingImportAccess(request);
  if (!access)
    return NextResponse.json(
      { error: "Admin or scoped import credential required" },
      { status: 401 },
    );
  const importId = new URL(request.url).searchParams.get("importId");
  if (!z.string().uuid().safeParse(importId).success)
    return NextResponse.json(
      { error: "Valid importId is required" },
      { status: 400 },
    );
  const supabase = createMarketingServerSupabase();
  const { data, error } = await supabase
    .from("marketing_imports")
    .select("file_name,error_report")
    .eq("id", importId!)
    .single();
  if (error || !data)
    return NextResponse.json(
      { error: "Import report not found" },
      { status: 404 },
    );
  const rows = (data.error_report ?? []) as ImportErrorReportRow[];
  const csv = [
    ["row", "result", "name", "phone", "email", "reason"],
    ...rows.map((row) => [
      row.row,
      row.result,
      row.name,
      row.phone,
      row.email,
      row.reason,
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${data.file_name.replace(/[^a-z0-9._-]/gi, "_")}-errors.csv"`,
    },
  });
}

async function commitRows(
  rows: ImportPreviewRow[],
  fileName: string,
  mapping: ImportMapping,
  actor: string,
) {
  const supabase = createMarketingServerSupabase();
  const summary = importSummary(rows);
  const initialReport = errorReport(rows);
  const { data: importRecord, error: importError } = await supabase
    .from("marketing_imports")
    .insert({
      file_name: fileName,
      status: "committed",
      mapping,
      row_counts: summary,
      error_report: initialReport,
      created_by: actor,
      committed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (importError) throw importError;
  const results: Array<{
    rowNumber: number;
    status: string;
    contactId?: string;
    error?: string;
  }> = [];
  for (const row of rows) {
    if (["invalid", "conflict", "needs_review"].includes(row.outcome)) {
      results.push({ rowNumber: row.rowNumber, status: row.outcome });
      continue;
    }
    try {
      const { data, error } = await supabase.rpc(
        "import_marketing_contact_row",
        {
          target_import_id: importRecord.id,
          target_name: row.values.name,
          target_company: row.values.company,
          target_trade: row.values.trade,
          target_area: row.values.area,
          phone_raw: row.values.phoneRaw,
          phone_normalized: row.values.phoneNormalized,
          email_raw: row.values.emailRaw,
          email_normalized: row.values.emailNormalized,
          target_source_url: row.values.sourceUrl,
          target_group_url: row.values.groupUrl,
          target_post_url: row.values.postUrl,
          target_source_label: fileName,
          target_discovered_at: row.values.sourceDate,
          target_row_number: row.rowNumber,
          phone_invalid_reason:
            row.values.phoneRaw && !row.values.phoneNormalized
              ? "invalid_phone_number"
              : null,
          email_invalid_reason:
            row.values.emailRaw && !row.values.emailNormalized
              ? "invalid_email_address"
              : null,
        },
      );
      if (error) throw error;
      const result = data as { contactId: string; status: string };
      results.push({
        rowNumber: row.rowNumber,
        status: result.status,
        contactId: result.contactId,
      });
    } catch (error) {
      console.error("Marketing contact import row failed", {
        importId: importRecord.id,
        rowNumber: row.rowNumber,
        error,
      });
      results.push({
        rowNumber: row.rowNumber,
        status: "invalid",
        error: "import_failed",
      });
    }
  }
  const finalReport = errorReport(rows, results);
  await supabase
    .from("marketing_imports")
    .update({ error_report: finalReport })
    .eq("id", importRecord.id);
  return {
    importId: importRecord.id,
    results,
    errorReport: finalReport,
    errorReportUrl: `/api/admin/marketing/import/contacts?importId=${importRecord.id}`,
  };
}

export async function POST(request: Request) {
  const access = await requireMarketingImportAccess(request);
  if (!access)
    return NextResponse.json(
      { error: "Admin or scoped import credential required" },
      { status: 401 },
    );
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let rows: ImportInputRow[] = [];
    let headers: string[] = [];
    let mapping: ImportMapping = {};
    let fileName = "api-import.json";
    let commit = false;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File))
        return NextResponse.json(
          { error: "XLSX or CSV file is required" },
          { status: 400 },
        );
      fileName = file.name;
      if (!/\.(xlsx|csv)$/i.test(fileName))
        return NextResponse.json(
          { error: "Only XLSX and CSV files are accepted" },
          { status: 400 },
        );
      if (file.size > 10 * 1024 * 1024)
        return NextResponse.json(
          { error: "File exceeds 10 MB" },
          { status: 413 },
        );
      ({ rows, headers } = await parseContactSpreadsheet(
        Buffer.from(await file.arrayBuffer()),
        fileName,
      ));
      mapping = form.get("mapping")
        ? (mappingSchema.parse(
            JSON.parse(String(form.get("mapping"))),
          ) as ImportMapping)
        : inferMapping(headers);
      commit = form.get("commit") === "true";
    } else {
      const body = jsonImportSchema.parse(await request.json());
      rows = body.rows ?? (body.contact ? [body.contact] : []);
      headers = rows.length ? Object.keys(rows[0]) : [];
      mapping = (body.mapping as ImportMapping) ?? inferMapping(headers);
      commit = body.commit === true;
      fileName = body.fileName ?? fileName;
    }
    if (!rows.length)
      return NextResponse.json(
        { error: "No contact rows found" },
        { status: 400 },
      );
    if (rows.length > 5000)
      return NextResponse.json(
        { error: "Import is limited to 5,000 rows" },
        { status: 413 },
      );
    const preview = previewContactImport(
      rows,
      mapping,
      await existingIdentities(rows, mapping),
    );
    if (!commit)
      return NextResponse.json({
        mode: "preview",
        fileName,
        headers,
        mapping,
        summary: importSummary(preview),
        rows: preview,
        errorReport: errorReport(preview),
      });
    const committed = await commitRows(
      preview,
      fileName,
      mapping,
      access.actor,
    );
    return NextResponse.json({
      mode: "committed",
      fileName,
      summary: importSummary(preview),
      ...committed,
    });
  } catch (error) {
    console.error("Marketing import request failed", error);
    return NextResponse.json(
      { error: "Import request is invalid", code: "MARKETING_IMPORT_INVALID" },
      { status: 400 },
    );
  }
}
