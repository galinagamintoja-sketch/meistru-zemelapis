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
  const { error } = await supabase.rpc("replace_tradesperson_location", {
    target_profile_id: profile.id,
    target_base_city: parsed.data.baseCity,
    target_registered_address: parsed.data.registeredAddress,
    target_google_place_id: parsed.data.googlePlaceId,
    target_latitude: parsed.data.latitude,
    target_longitude: parsed.data.longitude,
    target_radius_km: parsed.data.radiusKm
  });
  if (error) return NextResponse.json({ error: "Darbo zonos išsaugoti nepavyko." }, { status: 500 });
  await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: "tradesperson_areas_updated", notes: `Global radius ${parsed.data.radiusKm} km`, created_by_role: "tradesperson" });
  if (profile.base_city !== parsed.data.baseCity || profile.registered_address !== parsed.data.registeredAddress) {
    await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: "tradesperson_base_location_updated", notes: "Private working base updated", created_by_role: "tradesperson" });
  }
  if (profile.radius_km !== parsed.data.radiusKm) {
    await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: "tradesperson_radius_updated", notes: `${parsed.data.radiusKm} km`, created_by_role: "tradesperson" });
  }
  return NextResponse.json({ ok: true });
}
