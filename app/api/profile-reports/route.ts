import { NextResponse } from "next/server";
import { isSameOrigin } from "../../../lib/account-deletion";
import { profileReportSchema } from "../../../lib/profile-reports";
import { createServerSupabase } from "../../../lib/supabase";
import { profileReportAbuseKeys } from "../../../lib/profile-report-abuse";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const parsed = profileReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Patikrinkite pasirinktą problemą ir paaiškinimą." }, { status: 400 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Pranešimų paslauga nepasiekiama." }, { status: 503 });

  const { data: profile } = await supabase.from("tradesperson_profiles").select("id")
    .eq("id", parsed.data.profileId).eq("public_status", "public").eq("approval_status", "approved").maybeSingle();
  if (!profile) return NextResponse.json({ error: "Viešas profilis nerastas." }, { status: 404 });

  const abuse = profileReportAbuseKeys(request, parsed.data);
  const { error } = await supabase.rpc("submit_profile_report", {
    target_profile_id: parsed.data.profileId,
    report_reason: parsed.data.reason,
    report_details: parsed.data.details,
    report_email: parsed.data.reporterEmail || "",
    source_hash: abuse.sourceHash,
    fingerprint: abuse.fingerprint
  });
  if (error?.message?.includes("RATE_LIMITED")) {
    return NextResponse.json({ error: "Per daug pranešimų. Bandykite dar kartą po 24 valandų." }, { status: 429 });
  }
  if (error) return NextResponse.json({ error: "Pranešimo išsaugoti nepavyko." }, { status: 500 });
  return NextResponse.json({ accepted: true }, { status: 201 });
}
