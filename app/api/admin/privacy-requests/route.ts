import { NextResponse } from "next/server";
import { z } from "zod";
import { claimAndProcessAccountDeletions, isSameOrigin } from "../../../../lib/account-deletion";
import { requireAdminSession } from "../../../../lib/auth-session";
import { createServerSupabase } from "../../../../lib/supabase";

const retrySchema = z.object({ requestId: z.string().uuid() }).strict();

export async function GET() {
  const admin = await requireAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Paslauga nepasiekiama." }, { status: 503 });
  const { data, error } = await supabase.from("account_privacy_requests")
    .select("id,status,scheduled_deletion_at,attempt_count,last_error,requested_at")
    .eq("request_type", "account_deletion")
    .order("requested_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Privatumo prašymų įkelti nepavyko." }, { status: 500 });
  const requests = data ?? [];
  return NextResponse.json({
    counts: Object.fromEntries(["pending", "processing", "failed", "completed"].map((status) => [status, requests.filter((item) => item.status === status).length])),
    requests: requests.map((item) => ({
      id: item.id,
      status: item.status,
      scheduledDeletionAt: item.scheduled_deletion_at,
      attemptCount: item.attempt_count,
      lastError: item.last_error
    }))
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const parsed = retrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neteisingas prašymas." }, { status: 400 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Paslauga nepasiekiama." }, { status: 503 });
  const { data: target } = await supabase.from("account_privacy_requests").select("status")
    .eq("id", parsed.data.requestId).eq("request_type", "account_deletion").maybeSingle();
  if (target?.status !== "failed") return NextResponse.json({ error: "Pakartoti galima tik nepavykusį ištrynimą." }, { status: 409 });
  try {
    return NextResponse.json(await claimAndProcessAccountDeletions({ requestId: parsed.data.requestId }));
  } catch {
    return NextResponse.json({ error: "Pakartotinis vykdymas nepavyko." }, { status: 500 });
  }
}
