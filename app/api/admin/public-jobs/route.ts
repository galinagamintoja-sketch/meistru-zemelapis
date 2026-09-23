import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "../../../../lib/auth-session";
import { createServerSupabase } from "../../../../lib/supabase";

const result = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const mutation = z.object({ job_id: z.string().uuid(), status: z.enum(["hidden", "closed"]) }).strict();

export async function GET(request: Request) {
  if (!await requireAdminSession(request)) return result({ error: "unauthorized" }, 401);
  const db = createServerSupabase();
  if (!db) return result({ error: "unavailable" }, 503);
  const [jobs, failures, stats, active, expired] = await Promise.all([
    db.from("public_jobs").select("id,title,source_url,status,posted_at,expires_at,created_at")
      .order("created_at", { ascending: false }).limit(50),
    db.from("public_job_import_audit").select("reason_code,received_at")
      .eq("outcome", "failed").order("received_at", { ascending: false }).limit(10),
    db.rpc("public_job_daily_import_stats"),
    db.from("public_jobs").select("id", { count: "exact", head: true }).eq("status", "active")
      .gt("expires_at", new Date().toISOString()),
    db.from("public_jobs").select("id", { count: "exact", head: true })
      .lte("expires_at", new Date().toISOString())
  ]);
  if (jobs.error || failures.error || stats.error || active.error || expired.error) return result({ error: "unavailable" }, 503);
  return result({ ...(stats.data as Record<string, unknown>), active_jobs: active.count ?? 0, expired_jobs: expired.count ?? 0,
    jobs: jobs.data, recent_failures: failures.data ?? [] });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return result({ error: "unauthorized" }, 401);
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return result({ error: "forbidden" }, 403);
  const parsed = mutation.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return result({ error: "invalid_fields" }, 422);
  const db = createServerSupabase();
  if (!db) return result({ error: "unavailable" }, 503);
  const { data, error } = await db.rpc("moderate_public_job", {
    target_id: parsed.data.job_id, admin_identity: admin.email, next_status: parsed.data.status
  });
  if (error) return result({ error: "unavailable" }, 503);
  return result({ updated: Boolean(data) });
}
