import { NextResponse } from "next/server";
import { requireMarketingImportAccess } from "../../../../../../lib/marketing/authorization";
import { importSummary, previewContactImport } from "../../../../../../lib/marketing/import-service";
import { parseContactSpreadsheet } from "../../../../../../lib/marketing/spreadsheet";
import type { ExistingIdentity, ImportInputRow, ImportMapping, ImportPreviewRow } from "../../../../../../lib/marketing/types";
import { createServerSupabase } from "../../../../../../lib/supabase";

function inferMapping(headers: string[]): ImportMapping {
  const aliases: Record<keyof ImportMapping, string[]> = {
    name: ["name", "vardas", "pavadinimas"], company: ["company", "įmonė", "imone"], trade: ["trade", "profession", "specialybė", "specialybe"],
    area: ["area", "city", "miestas", "vieta"], phone: ["phone", "telefonas", "tel"], email: ["email", "el. paštas", "el pastas"],
    sourceUrl: ["source url", "source", "šaltinis", "saltinis"], groupUrl: ["group url", "group", "grupė", "grupe"],
    postUrl: ["post url", "post", "įrašas", "irasas"], sourceDate: ["source date", "date", "data"]
  };
  const normalized = new Map(headers.map((header) => [header.trim().toLowerCase(), header]));
  return Object.fromEntries(Object.entries(aliases).flatMap(([field, names]) => {
    const header = names.map((name) => normalized.get(name)).find(Boolean);
    return header ? [[field, header]] : [];
  })) as ImportMapping;
}

async function existingIdentities(): Promise<ExistingIdentity[]> {
  const supabase = createServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from("marketing_contact_identities").select("contact_id,identity_type,normalized_value").in("identity_type", ["phone", "email"]);
  if (error) throw error;
  return (data ?? []).map((row) => ({ contactId: row.contact_id, type: row.identity_type as "phone" | "email", normalizedValue: row.normalized_value }));
}

async function commitRows(rows: ImportPreviewRow[], fileName: string, mapping: ImportMapping, actor: string) {
  const supabase = createServerSupabase();
  if (!supabase) return { importId: null, results: rows.map((row) => ({ rowNumber: row.rowNumber, status: row.outcome })) };
  const summary = importSummary(rows);
  const { data: importRecord, error: importError } = await supabase.from("marketing_imports").insert({ file_name: fileName, status: "committed", mapping, row_counts: summary, created_by: actor, committed_at: new Date().toISOString() }).select("id").single();
  if (importError) throw importError;
  const results: Array<{ rowNumber: number; status: string; contactId?: string; error?: string }> = [];
  for (const row of rows) {
    if (row.outcome === "invalid" || row.outcome === "conflict") { results.push({ rowNumber: row.rowNumber, status: row.outcome }); continue; }
    try {
      const { data, error } = await supabase.rpc("import_marketing_contact_row", {
        target_import_id: importRecord.id, target_name: row.values.name, target_company: row.values.company,
        target_trade: row.values.trade, target_area: row.values.area, phone_raw: row.values.phoneRaw,
        phone_normalized: row.values.phoneNormalized, email_raw: row.values.emailRaw, email_normalized: row.values.emailNormalized,
        target_source_url: row.values.sourceUrl, target_group_url: row.values.groupUrl, target_post_url: row.values.postUrl,
        target_source_label: fileName, target_discovered_at: row.values.sourceDate, target_row_number: row.rowNumber
      });
      if (error) throw error;
      const result = data as { contactId: string; status: string };
      results.push({ rowNumber: row.rowNumber, status: result.status, contactId: result.contactId });
    } catch (error) {
      results.push({ rowNumber: row.rowNumber, status: "invalid", error: error instanceof Error ? error.message : "import_failed" });
    }
  }
  return { importId: importRecord.id, results };
}

export async function POST(request: Request) {
  const access = await requireMarketingImportAccess(request);
  if (!access) return NextResponse.json({ error: "Admin or scoped import credential required" }, { status: 401 });
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
      if (!(file instanceof File)) return NextResponse.json({ error: "XLSX or CSV file is required" }, { status: 400 });
      fileName = file.name;
      if (!/\.(xlsx|csv)$/i.test(fileName)) return NextResponse.json({ error: "Only XLSX and CSV files are accepted" }, { status: 400 });
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File exceeds 10 MB" }, { status: 413 });
      ({ rows, headers } = await parseContactSpreadsheet(Buffer.from(await file.arrayBuffer()), fileName));
      mapping = form.get("mapping") ? JSON.parse(String(form.get("mapping"))) : inferMapping(headers);
      commit = form.get("commit") === "true";
    } else {
      const body = await request.json();
      rows = Array.isArray(body.rows) ? body.rows : body.contact ? [body.contact] : [];
      headers = rows.length ? Object.keys(rows[0]) : [];
      mapping = body.mapping ?? inferMapping(headers);
      commit = body.commit === true;
      fileName = String(body.fileName ?? fileName);
    }
    if (!rows.length) return NextResponse.json({ error: "No contact rows found" }, { status: 400 });
    if (rows.length > 5000) return NextResponse.json({ error: "Import is limited to 5,000 rows" }, { status: 413 });
    const preview = previewContactImport(rows, mapping, await existingIdentities());
    if (!commit) return NextResponse.json({ mode: "preview", fileName, headers, mapping, summary: importSummary(preview), rows: preview });
    const committed = await commitRows(preview, fileName, mapping, access.actor);
    return NextResponse.json({ mode: "committed", fileName, summary: importSummary(preview), ...committed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 });
  }
}
