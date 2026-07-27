import { RequestInbox } from "../../../components/request-inbox";
import { UnlinkedAccount } from "../../../components/unlinked-account";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";

export default async function RequestsPage() {
  const { profile } = await requireOwnedProfile();
  if (!profile) return <UnlinkedAccount />;
  return <div className="portal-page"><div className="portal-heading"><p className="eyebrow">Darbo pasiūlymai</p><h1>Užklausos</h1><p>Peržiūrėkite tik jūsų paslaugas ir darbo zoną atitinkančius klientų darbus.</p></div><RequestInbox /></div>;
}
