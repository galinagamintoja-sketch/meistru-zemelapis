import { NextResponse } from "next/server";
import { validJobsImportBearer } from "../../../../../../lib/private-jobs-auth";
import { createServerSupabase } from "../../../../../../lib/supabase";
import { JOB_MAX_AGE_DAYS, JOB_MAX_AREA_IDS, JOB_MAX_IMPORT_BYTES, JOB_MAX_TRADE_IDS } from "../../../../../../lib/public-jobs-import";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!process.env.LOCALPRO_JOBS_IMPORT_TOKEN) return response({ error: "import_disabled" }, 503);
  if (!validJobsImportBearer(request)) return response({ error: "unauthorized" }, 401);
  const db = createServerSupabase();
  if (!db) return response({ error: "database_unavailable" }, 503);
  const [trades, areas] = await Promise.all([
    db.from("service_subcategories").select("id,name,slug,category:service_categories!service_subcategories_service_category_id_fkey(id,name,slug)").eq("is_active", true).order("name"),
    db.from("job_areas").select("id,name,kind").eq("is_active", true).order("name")
  ]);
  if (trades.error || areas.error) return response({ error: "database_unavailable" }, 503);
  return response({ schema_version: 1, limits: {
    max_trade_ids: JOB_MAX_TRADE_IDS,
    max_area_ids: JOB_MAX_AREA_IDS,
    max_body_bytes: JOB_MAX_IMPORT_BYTES,
    max_age_days: JOB_MAX_AGE_DAYS
  }, trades: trades.data, areas: areas.data }, 200);
}
