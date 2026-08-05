import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveAccountDeletion, isSameOrigin, loginEmailMatches } from "../../../../lib/account-deletion";
import { validateProfileForPublication } from "../../../../lib/profile-publication-readiness";
import { createServerSupabase } from "../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("data_export") }).strict(),
  z.object({
    type: z.literal("account_deletion"),
    confirmationEmail: z.string().trim().email().max(254),
    understandsPermanentDeletion: z.literal(true)
  }).strict()
]);

export async function GET() {
  const { user } = await requireOwnedProfile();
  const deletion = await getActiveAccountDeletion(user.id);
  return NextResponse.json({ deletion });
}

export async function POST(request: Request) {
  const { user, profile } = await requireOwnedProfile();
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neteisingas prašymas." }, { status: 400 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Paslauga nepasiekiama." }, { status: 503 });

  if (parsed.data.type === "data_export") {
    const { error } = await supabase.from("account_privacy_requests").insert({
      auth_user_id: user.id,
      tradesperson_profile_id: profile?.id ?? null,
      request_type: "data_export"
    });
    if (error?.code === "23505") return NextResponse.json({ message: "Toks prašymas jau laukia vykdymo." });
    if (error) return NextResponse.json({ error: "Prašymo pateikti nepavyko." }, { status: 500 });
    return NextResponse.json({ message: "Duomenų kopijos prašymas užregistruotas." });
  }

  if (!loginEmailMatches(user, parsed.data.confirmationEmail)) {
    return NextResponse.json({ error: "Įvestas el. paštas nesutampa su prisijungimo el. paštu." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("schedule_account_deletion", { p_auth_user_id: user.id });
  if (error) return NextResponse.json({ error: "Paskyros ištrynimo suplanuoti nepavyko." }, { status: 500 });
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.scheduled_at) return NextResponse.json({ error: "Serveris negrąžino ištrynimo datos." }, { status: 500 });
  return NextResponse.json({
    message: "Paskyros ištrynimas suplanuotas.",
    deletion: {
      id: result.request_id,
      status: result.request_status,
      scheduledDeletionAt: result.scheduled_at,
      profileHidden: Boolean(result.profile_hidden),
      existingRequestReused: Boolean(result.existing_request_reused)
    }
  });
}

export async function DELETE(request: Request) {
  const { user, profile } = await requireOwnedProfile();
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Paslauga nepasiekiama." }, { status: 503 });

  let restoreProfile = false;
  let validationErrors: string[] = [];
  if (profile && profile.approval_status === "approved") {
    validationErrors = await validateProfileForPublication(supabase, profile.id, { requireAllActivePhotosApproved: false });
    restoreProfile = validationErrors.length === 0;
  }

  const { data, error } = await supabase.rpc("cancel_account_deletion", {
    p_auth_user_id: user.id,
    p_restore_profile: restoreProfile
  });
  if (error?.message?.includes("deletion_already_processing")) {
    return NextResponse.json({ error: "Ištrynimas jau pradėtas ir jo atšaukti nebegalima." }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: "Paskyros ištrynimo atšaukti nepavyko." }, { status: 409 });
  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    message: result?.profile_restored
      ? "Paskyros ištrynimas atšauktas. Profilis vėl rodomas viešai."
      : "Paskyros ištrynimas atšauktas. Profilis lieka paslėptas, kol atitiks viešinimo reikalavimus.",
    profileRestored: Boolean(result?.profile_restored),
    validationErrors
  });
}
