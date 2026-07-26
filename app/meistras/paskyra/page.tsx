import { PortalCard } from "../../../components/tradesperson-shell";
import { LoginEmailForm } from "../../../components/tradesperson-forms";
import { requireTradespersonUser } from "../../../lib/tradesperson-account";
export default async function Page() {
  const user = await requireTradespersonUser();
  return <div className="portal-page"><div className="portal-heading"><h1>Paskyra</h1><p>Prisijungimas, privatumas ir sutikimai.</p></div><PortalCard title="Google paskyra"><LoginEmailForm email={user.email ?? ""} /><hr /><form action="/auth/logout" method="post"><button className="portal-secondary" type="submit">Atsijungti</button></form></PortalCard></div>;
}
