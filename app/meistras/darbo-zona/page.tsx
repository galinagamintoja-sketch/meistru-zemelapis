import { PortalCard } from "../../../components/tradesperson-shell";
import { AreasForm } from "../../../components/tradesperson-forms";
import { UnlinkedAccount } from "../../../components/unlinked-account";
import { createServerSupabase } from "../../../lib/supabase";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";
export default async function Page() {
  const { profile } = await requireOwnedProfile(); if (!profile) return <UnlinkedAccount />;
  const supabase = createServerSupabase();
  const { data: areas } = supabase ? await supabase.from("operating_areas").select("city").eq("tradesperson_profile_id", profile.id).order("city") : { data: [] };
  return <div className="portal-page"><div className="portal-heading"><h1>Darbo zona</h1><p>Nurodykite miestus ir aptarnavimo atstumą. Tikslus adresas ir koordinatės išlieka privatūs.</p></div><PortalCard title="Aptarnaujama teritorija"><AreasForm baseCity={profile.base_city} radiusKm={profile.radius_km} cities={(areas ?? []).map((area) => area.city)} /></PortalCard></div>;
}
