import { PortalCard } from "../../../components/tradesperson-shell";
import { ProfileForm } from "../../../components/tradesperson-forms";
import { UnlinkedAccount } from "../../../components/unlinked-account";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";
export default async function Page() {
  const { profile } = await requireOwnedProfile();
  if (!profile) return <UnlinkedAccount />;
  return <div className="portal-page"><div className="portal-heading"><h1>Mano profilis</h1><p>Keiskite viešą informaciją. Nuotraukos tikrinamos atskirai.</p></div><PortalCard title="Profilio informacija"><ProfileForm initial={{ displayName: profile.display_name, companyName: profile.company_name ?? "", phone: profile.phone, whatsappNumber: profile.whatsapp_number ?? "", publicEmail: profile.email, description: profile.description ?? "" }} /></PortalCard></div>;
}
