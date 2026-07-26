import Link from "next/link";
import { PortalCard } from "../../components/tradesperson-shell";
import { UnlinkedAccount } from "../../components/unlinked-account";
import { getLinkedTradespersonProfile, requireTradespersonUser } from "../../lib/tradesperson-account";

export default async function DashboardPage() {
  const user = await requireTradespersonUser();
  const profile = await getLinkedTradespersonProfile(user.id);
  if (!profile) return <UnlinkedAccount />;
  return (
    <div className="portal-page">
      <div className="portal-heading"><p className="eyebrow">Apžvalga</p><h1>Sveiki, {profile.display_name}</h1><p>Tvarkykite LocalPro profilį vienoje vietoje.</p></div>
      <div className="portal-grid">
        <PortalCard title="Profilio būsena"><span className="status-badge status-success">{profile.public_status === "public" ? "Viešas" : "Neviešas"}</span><p>Administratoriaus būsena: {profile.approval_status}</p></PortalCard>
        <PortalCard title="Greiti veiksmai"><div className="portal-links"><Link href="/meistras/profilis">Redaguoti profilį</Link><Link href="/meistras/nuotraukos">Tvarkyti nuotraukas</Link></div></PortalCard>
      </div>
    </div>
  );
}
