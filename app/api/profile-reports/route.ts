import { NextResponse } from "next/server";
import { isSameOrigin } from "../../../lib/account-deletion";
import { profileReportSchema } from "../../../lib/profile-reports";
import { createServerSupabase } from "../../../lib/supabase";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const parsed = profileReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Patikrinkite pasirinktą problemą ir paaiškinimą." }, { status: 400 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Pranešimų paslauga nepasiekiama." }, { status: 503 });

  const { data: profile } = await supabase.from("tradesperson_profiles").select("id")
    .eq("id", parsed.data.profileId).eq("public_status", "public").eq("approval_status", "approved").maybeSingle();
  if (!profile) return NextResponse.json({ error: "Viešas profilis nerastas." }, { status: 404 });

  const { error } = await supabase.from("profile_reports").insert({
    tradesperson_profile_id: parsed.data.profileId,
    reason: parsed.data.reason,
    details: parsed.data.details,
    reporter_email: parsed.data.reporterEmail || null
  });
  if (error) return NextResponse.json({ error: "Pranešimo išsaugoti nepavyko." }, { status: 500 });
  return NextResponse.json({ accepted: true }, { status: 201 });
}
