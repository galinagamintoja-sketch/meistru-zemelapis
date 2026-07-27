import { PortalCard } from "../../../components/tradesperson-shell";
import { ServicesForm } from "../../../components/tradesperson-forms";
import { UnlinkedAccount } from "../../../components/unlinked-account";
import { createServerSupabase } from "../../../lib/supabase";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";
export default async function Page() {
  const { profile } = await requireOwnedProfile(); if (!profile) return <UnlinkedAccount />;
  const supabase = createServerSupabase();
  const [{ data: categories }, { data: current }] = supabase ? await Promise.all([
    supabase.from("service_categories").select("id,name,service_subcategories(id,name)").eq("is_active", true).eq("service_subcategories.is_active", true).order("sort_order"),
    supabase.from("profile_services").select("service_subcategory_id").eq("tradesperson_profile_id", profile.id)
  ]) : [{ data: [] }, { data: [] }];
  const groups = (categories ?? []).map((category) => ({ id: category.id, name: category.name, items: category.service_subcategories ?? [] }));
  return <div className="portal-page"><div className="portal-heading"><h1>Paslaugos</h1><p>Pasirinkite darbus, privačią darbo bazę ir vieną bendrą aptarnavimo spindulį.</p></div><PortalCard title="Mano paslaugos"><ServicesForm groups={groups} selected={(current ?? []).map((item) => item.service_subcategory_id).filter(Boolean)} location={{
    baseCity: profile.base_city ?? "", radiusKm: profile.radius_km ?? 20,
    address: profile.registered_address ?? "", placeId: profile.google_place_id ?? "",
    latitude: profile.latitude ?? null, longitude: profile.longitude ?? null, town: profile.base_city ?? ""
  }} /></PortalCard></div>;
}
