import Link from "next/link";
import { AccountActions } from "../../../components/account-actions";
import { PortalCard } from "../../../components/tradesperson-shell";
import { LoginEmailForm } from "../../../components/tradesperson-forms";
import { requireOwnedProfile } from "../../../lib/tradesperson-account";

export default async function Page() {
  const { user, profile } = await requireOwnedProfile();
  const providers = [...new Set((user.identities ?? []).map((identity) => identity.provider))];
  const hasPassword = providers.includes("email");
  return <div className="portal-page"><div className="portal-heading"><h1>Paskyra</h1><p>Prisijungimas, nuosavybė, privatumas ir pagalba.</p></div>
    <div className="portal-grid">
      <PortalCard title="Prisijungimo duomenys">
        <dl className="account-summary"><div><dt>Prisijungimo el. paštas</dt><dd>{user.email ?? "Nenurodytas"}</dd></div><div><dt>Patvirtinimas</dt><dd>{user.email_confirmed_at ? "El. paštas patvirtintas" : "Laukia patvirtinimo"}</dd></div><div><dt>Prijungta</dt><dd>{providers.map((provider) => provider === "google" ? "Google" : "El. paštas").join(", ") || "El. paštas"}</dd></div></dl>
        <LoginEmailForm email={user.email ?? ""} />
      </PortalCard>
      <PortalCard title="Profilio nuosavybė"><p>{profile ? "Paskyra saugiai susieta su specialisto profiliu." : "Ši paskyra dar nesusieta su specialisto profiliu."}</p>{!profile ? <Link href="/meistras/susieti">Susieti profilį</Link> : null}</PortalCard>
      <PortalCard title="Privatumas ir paskyros veiksmai"><p>Viešas kontaktinis el. paštas keičiamas skiltyje „Mano profilis“ ir nėra naudojamas prisijungimo nuosavybei nustatyti.</p><p><Link href="/privacy">Privatumo politika</Link> · <Link href="/terms">Naudojimo sąlygos</Link></p><AccountActions hasPassword={hasPassword} email={user.email ?? ""} /></PortalCard>
      <PortalCard title="Atsijungti"><form action="/auth/logout" method="post"><button className="portal-secondary" type="submit">Atsijungti</button></form></PortalCard>
    </div>
  </div>;
}
