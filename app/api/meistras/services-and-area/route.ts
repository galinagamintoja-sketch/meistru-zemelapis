import { NextResponse } from "next/server";
import { accountMutationBlocked, isSameOrigin } from "../../../../lib/account-deletion";
import { createServerSupabase } from "../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";
import { tradespersonServicesAndAreaUpdateSchema } from "../../../../lib/tradesperson-profile-schema";

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const { user, profile } = await requireOwnedProfile();
  if (await accountMutationBlocked(user.id)) {
    return NextResponse.json({ error: "Paskyros ištrynimas suplanuotas. Pakeitimai laikinai išjungti." }, { status: 409 });
  }
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });

  const parsed = tradespersonServicesAndAreaUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Patikrinkite darbo sritis, paslaugas ir darbo zoną." }, { status: 400 });

  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Duomenų bazė nepasiekiama." }, { status: 503 });
  const { categoryIds, subcategoryIds, area } = parsed.data;
  const { error } = await supabase.rpc("replace_tradesperson_services_and_area", {
    target_profile_id: profile.id,
    target_category_ids: categoryIds,
    target_subcategory_ids: subcategoryIds,
    target_base_city: area.baseCity,
    target_registered_address: area.registeredAddress,
    target_google_place_id: area.googlePlaceId,
    target_latitude: area.latitude,
    target_longitude: area.longitude,
    target_radius_km: area.radiusKm
  });
  if (error) return NextResponse.json(
    { error: error.code === "22023" ? "Patikrinkite darbo sritis, paslaugas ir darbo zoną." : "Paslaugų ir darbo zonos išsaugoti nepavyko." },
    { status: error.code === "22023" ? 400 : 500 }
  );
  return NextResponse.json({ ok: true });
}
