import { NextResponse } from "next/server";
import { z } from "zod";
import { validateProfileForPublication } from "../../../../lib/profile-publication-readiness";
import { createServerSupabase } from "../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";
import { accountMutationBlocked } from "../../../../lib/account-deletion";

const visibilitySchema = z.object({ visible: z.boolean() }).strict();

export async function PATCH(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  }

  const { user, profile } = await requireOwnedProfile();
  if (await accountMutationBlocked(user.id)) return NextResponse.json({ error: "Paskyros ištrynimas suplanuotas. Profilio viešinti negalima." }, { status: 409 });
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
    const validationErrors = await validateProfileForPublication(supabase, profile.id, {
      requireAllActivePhotosApproved: false
    });
    if (validationErrors.length) {
      return NextResponse.json({
        error: "Prieš vėl rodydami profilį užbaikite privalomus profilio duomenis.",
        validationErrors
      }, { status: 409 });
    }
  }

  const { data, error } = await supabase.rpc("set_owned_profile_visibility", {
    p_profile_id: profile.id,
    p_visible: parsed.data.visible
  });
  if (error) {
    if (error.message?.includes("profile_not_approved")) {
      return NextResponse.json({ error: "Profilio būsena pasikeitė. Atnaujinkite puslapį ir bandykite dar kartą." }, { status: 409 });
    }
    return NextResponse.json({ error: "Profilio matomumo pakeisti nepavyko." }, { status: 500 });
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || result.public_status !== targetStatus) {
    return NextResponse.json({ error: "Profilio būsena pasikeitė. Atnaujinkite puslapį ir bandykite dar kartą." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, publicStatus: targetStatus });
}
