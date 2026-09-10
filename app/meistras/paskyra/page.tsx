import Link from "next/link";
import { AccountActions } from "../../../components/account-actions";
import { PortalCard } from "../../../components/tradesperson-shell";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";
import { requireAdminSession } from "../../../lib/auth-session";
import { getActiveAccountDeletion } from "../../../lib/account-deletion";

export default async function Page() {
  const { user, profile } = await requireOwnedProfile();
  const admin = await requireAdminSession();
  const deletion = await getActiveAccountDeletion(user.id);
  const providers = [...new Set((user.identities ?? []).map((identity) => identity.provider))];
  return <div className="portal-page"><div className="portal-heading"><h1>Paskyra</h1><p>Prisijungimas, nuosavybė, privatumas ir pagalba.</p></div>
    <div className="portal-grid">
      <PortalCard title="Prisijungimo duomenys">
        <dl className="account-summary"><div><dt>Google paskyros el. paštas</dt><dd>{user.email ?? "Nenurodytas"}</dd></div><div><dt>Patvirtinimas</dt><dd>{user.email_confirmed_at ? "El. paštas patvirtintas" : "Laukia patvirtinimo"}</dd></div><div><dt>Prisijungimo būdas</dt><dd>{providers.includes("google") ? "Google" : "Google paskyra neprijungta"}</dd></div></dl>
      </PortalCard>
      <PortalCard title="Profilio nuosavybė"><p>{profile ? "Paskyra saugiai susieta su specialisto profiliu." : "Ši paskyra dar nesusieta su specialisto profiliu."}</p>{!profile ? <Link href="/meistras/susieti">Susieti profilį</Link> : null}</PortalCard>
      <PortalCard title="Privatumas ir paskyros veiksmai"><p>Viešas kontaktinis el. paštas keičiamas skiltyje „Mano profilis“ ir nėra naudojamas prisijungimo nuosavybei nustatyti.</p><p><Link href="/privacy">Privatumo politika</Link> · <Link href="/terms">Naudojimo sąlygos</Link></p><AccountActions initialDeletion={deletion} /></PortalCard>
      {admin ? <PortalCard title="Administravimas"><p>Šiai paskyrai serveris patvirtino administratoriaus prieigą.</p><div className="portal-actions"><Link className="portal-primary" href="/admin">Atidaryti administravimą</Link></div></PortalCard> : null}
      <PortalCard title="Atsijungti"><form action="/auth/logout" method="post"><button className="portal-secondary" type="submit">Atsijungti</button></form></PortalCard>
    </div>
  </div>;
}
