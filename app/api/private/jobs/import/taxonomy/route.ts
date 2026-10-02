import { NextResponse } from "next/server";
import { validJobsImportBearer } from "../../../../../../lib/private-jobs-auth";
import { createServerSupabase } from "../../../../../../lib/supabase";

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
    db.from("service_subcategories").select("id,name,slug").eq("is_active", true).order("name"),
    db.from("job_areas").select("id,name,kind").eq("is_active", true).order("name")
  ]);
  if (trades.error || areas.error) return response({ error: "database_unavailable" }, 503);
  return response({ schema_version: 1, trades: trades.data, areas: areas.data }, 200);
}
