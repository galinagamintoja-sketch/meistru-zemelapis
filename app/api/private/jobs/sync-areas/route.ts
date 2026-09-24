import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import areas from "../../../../../lib/job-areas-lithuania.json";
import { createServerSupabase } from "../../../../../lib/supabase";

export const runtime = "nodejs";

function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// Fixed, idempotent seed endpoint for the 033 rollout. No caller-supplied area
// data is accepted; existing IDs are left untouched so past imports remain stable.
export async function POST(request: Request) {
  const expected = process.env.LOCALPRO_JOBS_IMPORT_TOKEN;
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
  if (!expected || !supplied) return reply({ error: "unauthorized" }, 401);
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) return reply({ error: "unauthorized" }, 401);
  const db = createServerSupabase();
  if (!db) return reply({ error: "unavailable" }, 503);
  const { data: existing, error: readError } = await db.from("job_areas").select("id");
  if (readError || !existing) return reply({ error: "unavailable" }, 503);
  const ids = new Set(existing.map((row) => row.id));
  const missing = areas.filter((area) => !ids.has(area.id));
  if (missing.length) {
    const { error: insertError } = await db.from("job_areas").insert(missing);
    if (insertError) return reply({ error: "unavailable" }, 503);
  }
  return reply({ inserted: missing.length, total_expected: areas.length }, 200);
}
