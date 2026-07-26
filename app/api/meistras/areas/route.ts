import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";
import { tradespersonAreasUpdateSchema } from "../../../../lib/tradesperson-profile-schema";

export async function PUT(request: Request) {
  const { profile } = await requireOwnedProfile();
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });
  const parsed = tradespersonAreasUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Patikrinkite darbo zoną." }, { status: 400 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Duomenų bazė nepasiekiama." }, { status: 503 });
  const { error: profileError } = await supabase.from("tradesperson_profiles").update({
    base_city: parsed.data.baseCity,
    radius_km: parsed.data.radiusKm,
    registered_address: parsed.data.registeredAddress,
    google_place_id: parsed.data.googlePlaceId || null,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    service_area_label: parsed.data.radiusKm === 150 ? "Visa Lietuva" : `${parsed.data.baseCity} + ${parsed.data.radiusKm} km`,
    updated_at: new Date().toISOString()
  }).eq("id", profile.id);
  if (profileError) return NextResponse.json({ error: "Darbo zonos išsaugoti nepavyko." }, { status: 500 });
  await supabase.from("operating_areas").delete().eq("tradesperson_profile_id", profile.id);
  const { error } = await supabase.from("operating_areas").insert({ tradesperson_profile_id: profile.id, city: parsed.data.baseCity, radius_km: parsed.data.radiusKm });
  if (error) return NextResponse.json({ error: "Darbo zonos išsaugoti nepavyko." }, { status: 500 });
  await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: "tradesperson_areas_updated", notes: `Global radius ${parsed.data.radiusKm} km`, created_by_role: "tradesperson" });
  return NextResponse.json({ ok: true });
}
