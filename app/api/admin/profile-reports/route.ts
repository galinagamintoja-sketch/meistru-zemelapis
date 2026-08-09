import { NextResponse } from "next/server";
import { isSameOrigin } from "../../../../lib/account-deletion";
import { requireAdminSession } from "../../../../lib/auth-session";
import { profileReportStatusSchema } from "../../../../lib/profile-reports";
import { createServerSupabase } from "../../../../lib/supabase";

export async function GET(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ reports: [] });
  const { data, error } = await supabase.from("profile_reports")
    .select("id,reason,details,reporter_email,status,admin_notes,created_at,reviewed_at,tradesperson_profiles(id,display_name,company_name)")
    .order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Pranešimų įkelti nepavyko." }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const parsed = profileReportStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neteisingas pranešimo atnaujinimas." }, { status: 400 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Paslauga nepasiekiama." }, { status: 503 });
  const { error } = await supabase.from("profile_reports").update({
    status: parsed.data.status,
    admin_notes: parsed.data.adminNotes || null,
    reviewed_at: new Date().toISOString()
  }).eq("id", parsed.data.reportId);
  if (error) return NextResponse.json({ error: "Pranešimo atnaujinti nepavyko." }, { status: 500 });
  return NextResponse.json({ updated: true });
}
