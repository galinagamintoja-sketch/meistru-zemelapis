import { NextResponse } from "next/server";
import { z } from "zod";
import { validateProfileForPublication } from "../../../../lib/profile-publication-readiness";
import { createServerSupabase } from "../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";

const visibilitySchema = z.object({ visible: z.boolean() }).strict();

export async function PATCH(request: Request) {
  const { profile } = await requireOwnedProfile();
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });

  const parsed = visibilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neteisingas matomumo pasirinkimas." }, { status: 400 });

  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Duomenų bazė nepasiekiama." }, { status: 503 });

  const targetStatus = parsed.data.visible ? "public" : "private";
  if (profile.public_status === targetStatus) return NextResponse.json({ ok: true, publicStatus: targetStatus });

  if (parsed.data.visible) {
    if (profile.approval_status !== "approved") {
      return NextResponse.json({ error: "Profilį vėl rodyti galima tik tada, kai jis patvirtintas." }, { status: 409 });
    }
    const validationErrors = await validateProfileForPublication(supabase, profile.id);
    if (validationErrors.length) {
      return NextResponse.json({
        error: "Prieš vėl rodydami profilį užbaikite privalomus profilio duomenis.",
        validationErrors
      }, { status: 409 });
    }
  }

  let update = supabase
    .from("tradesperson_profiles")
    .update({ public_status: targetStatus })
    .eq("id", profile.id);
  if (parsed.data.visible) update = update.eq("approval_status", "approved");

  const { data: updated, error: updateError } = await update.select("id").maybeSingle();
  if (updateError) return NextResponse.json({ error: "Profilio matomumo pakeisti nepavyko." }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Profilio būsena pasikeitė. Atnaujinkite puslapį ir bandykite dar kartą." }, { status: 409 });

  const { error: auditError } = await supabase.from("admin_actions").insert({
    tradesperson_profile_id: profile.id,
    action: parsed.data.visible ? "tradesperson_profile_restored" : "tradesperson_profile_hidden",
    notes: parsed.data.visible ? "Profile visibility restored by owner" : "Profile temporarily hidden by owner",
    created_by_role: "tradesperson"
  });
  if (auditError) return NextResponse.json({ error: "Matomumas pakeistas, bet veiksmo įrašo išsaugoti nepavyko." }, { status: 500 });

  return NextResponse.json({ ok: true, publicStatus: targetStatus });
}
