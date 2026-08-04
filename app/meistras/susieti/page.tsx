import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountResolutionConfirmation } from "../../../components/account-resolution-confirmation";
import { inspectVerifiedEmailResolution } from "../../../lib/verified-email-resolution";

export const dynamic = "force-dynamic";

export default async function ResolveAccountPage() {
  const resolution = await inspectVerifiedEmailResolution();
  if (resolution.linked) redirect("/meistras/uzklausos");
  if (resolution.outcome === "unique_match" && resolution.candidateCount === 1) {
    return <main className="portal-page"><section className="portal-card unlinked-account">
      <span className="status-badge status-warning">Rasta paskyra</span>
      <h1>Galite atidaryti savo LocalPro paskyrą.</h1>
      <p>Patvirtinus paskyra bus saugiai susieta su jūsų patvirtintu prisijungimu.</p>
      <AccountResolutionConfirmation />
    </section></main>;
  }
  if (resolution.outcome === "ambiguous" || resolution.outcome === "ownership_conflict") {
    return <main className="portal-page"><section className="portal-card unlinked-account">
      <span className="status-badge status-warning">Reikia administratoriaus sprendimo</span>
      <h1>Paskyros automatiškai susieti negalime.</h1>
      <p>Administratorius patikrins nuosavybę. Jokia privati profilio informacija šiame lange nerodoma.</p>
      <Link className="portal-secondary" href="/">Grįžti į pradžią</Link>
    </section></main>;
  }
  redirect("/meistro-registracija");
}
