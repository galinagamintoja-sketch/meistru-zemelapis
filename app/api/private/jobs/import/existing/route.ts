import { NextResponse } from "next/server";
import { JOB_MAX_AGE_DAYS } from "../../../../../../lib/public-jobs-import";
import { validJobsImportBearer } from "../../../../../../lib/private-jobs-auth";
import { createServerSupabase } from "../../../../../../lib/supabase";

export const runtime = "nodejs";
const PAGE_SIZE = 200;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!process.env.LOCALPRO_JOBS_IMPORT_TOKEN) return response({ error: "import_disabled" }, 503);
  if (!validJobsImportBearer(request)) return response({ error: "unauthorized" }, 401);
  const offsetText = new URL(request.url).searchParams.get("offset") ?? "0";
  if (!/^(0|[1-9][0-9]{0,5})$/u.test(offsetText)) return response({ error: "invalid_offset" }, 400);
  const offset = Number(offsetText);
  const db = createServerSupabase();
  if (!db) return response({ error: "database_unavailable" }, 503);
  const cutoff = new Date(Date.now() - JOB_MAX_AGE_DAYS * 86_400_000).toISOString();
  const { data, error } = await db.from("public_jobs")
    .select("id,source_url,source_post_id,title,summary,posted_at,status")
    .gte("posted_at", cutoff)
    .order("posted_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + PAGE_SIZE);
  if (error || !data) return response({ error: "database_unavailable" }, 503);
  return response({ schema_version: 1, jobs: data.slice(0, PAGE_SIZE),
    has_more: data.length > PAGE_SIZE, next_offset: data.length > PAGE_SIZE ? offset + PAGE_SIZE : null }, 200);
}
