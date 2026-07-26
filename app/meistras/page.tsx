import Link from "next/link";
import { PortalCard } from "../../components/tradesperson-shell";
import { UnlinkedAccount } from "../../components/unlinked-account";
import { getLinkedTradespersonProfile, requireTradespersonUser } from "../../lib/tradesperson-account";
import { OperatingAreaMap } from "../../components/operating-area-map";
import { createServerSupabase } from "../../lib/supabase";

export default async function DashboardPage() {
  const user = await requireTradespersonUser();
  const profile = await getLinkedTradespersonProfile(user.id);
  if (!profile) return <UnlinkedAccount />;
  const supabase = createServerSupabase();
  const { data: privateLocation } = supabase
    ? await supabase.from("tradesperson_profiles").select("latitude,longitude").eq("id", profile.id).single()
    : { data: null };
  return (
    <div className="portal-page">
      <div className="portal-heading"><p className="eyebrow">Apžvalga</p><h1>Sveiki, {profile.display_name}</h1><p>Tvarkykite LocalPro profilį vienoje vietoje.</p></div>
      <section className="portal-map-card">
        <OperatingAreaMap latitude={privateLocation?.latitude ?? null} longitude={privateLocation?.longitude ?? null} radiusKm={profile.radius_km} city={profile.base_city} />
        <div><span className="status-badge status-success">Darbo zona</span><h2>{profile.base_city}</h2><p>Iki {profile.radius_km} km nuo pagrindinės vietovės</p><Link href="/meistras/darbo-zona">Keisti darbo zoną</Link></div>
      </section>
      <div className="portal-grid">
        <PortalCard title="Profilio būsena"><span className="status-badge status-success">{profile.public_status === "public" ? "Viešas" : "Neviešas"}</span><p>Administratoriaus būsena: {profile.approval_status}</p></PortalCard>
        <PortalCard title="Greiti veiksmai"><div className="portal-links"><Link href="/meistras/profilis">Redaguoti profilį</Link><Link href="/meistras/nuotraukos">Tvarkyti nuotraukas</Link></div></PortalCard>
      </div>
    </div>
  );
}
