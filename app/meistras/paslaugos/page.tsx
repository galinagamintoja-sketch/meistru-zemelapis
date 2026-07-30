import { PortalCard } from "../../../components/tradesperson-shell";
import { ServicesForm } from "../../../components/tradesperson-forms";
import { UnlinkedAccount } from "../../../components/unlinked-account";
import { createServerSupabase } from "../../../lib/supabase";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";
import { categoriesFromAssignments, categoriesFromLegacy } from "../../../lib/service-taxonomy";
export default async function Page() {
  const { profile } = await requireOwnedProfile(); if (!profile) return <UnlinkedAccount />;
  const supabase = createServerSupabase();
  const [{ data: assignmentCategories, error: assignmentError }, { data: legacyCategories }, { data: current }] = supabase ? await Promise.all([
    supabase.from("service_categories").select("id,name,slug,service_category_assignments(service_subcategories(id,name,slug,is_active))").eq("is_active", true).order("sort_order"),
    supabase.from("service_categories").select("id,name,slug,service_subcategories!service_subcategories_service_category_id_fkey(id,name,slug,is_active)").eq("is_active", true).eq("service_subcategories.is_active", true).order("sort_order"),
    supabase.from("profile_services").select("service_subcategory_id").eq("tradesperson_profile_id", profile.id)
  ]) : [{ data: [], error: null }, { data: [] }, { data: [] }];
  const groups = !assignmentError && assignmentCategories?.length
    ? categoriesFromAssignments(assignmentCategories).map((category) => ({ id: category.id, name: category.name, items: category.subcategories }))
    : categoriesFromLegacy(legacyCategories ?? []).map((category) => ({ id: category.id, name: category.name, items: category.subcategories }));
  return <div className="portal-page"><div className="portal-heading"><h1>Paslaugos</h1><p>Pasirinkite darbo sritis ir konkrečias paslaugas, privačią darbo bazę bei vieną bendrą aptarnavimo spindulį.</p></div><PortalCard title="Mano paslaugos"><ServicesForm groups={groups} selected={(current ?? []).map((item) => item.service_subcategory_id).filter(Boolean)} location={{
    baseCity: profile.base_city ?? "", radiusKm: profile.radius_km ?? 20,
    address: profile.registered_address ?? "", placeId: profile.google_place_id ?? "",
    latitude: profile.latitude ?? null, longitude: profile.longitude ?? null, town: profile.base_city ?? ""
  }} /></PortalCard></div>;
}
