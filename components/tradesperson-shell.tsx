import Link from "next/link";
import { TradespersonNavigation } from "./tradesperson-navigation";
import LocalProBrand from "./LocalProBrand";
import { LanguageSwitcher, TranslationController } from "./TradespersonLanguage";

type ShellProfile = { name: string; profession?: string | null; active: boolean; photoUrl?: string | null };

export function TradespersonShell({ children, profile, deletionPending = false }: { children: React.ReactNode; profile: ShellProfile; deletionPending?: boolean }) {
  const initial = profile.name.trim().charAt(0).toLocaleUpperCase("lt-LT") || "M";
  return <div className="tradesperson-shell" data-tradesperson-language-surface>
    <TranslationController />
    <aside className="tradesperson-sidebar">
      <Link className="brand" href="/">
        <LocalProBrand priority />
      </Link>
      <section className="tradesperson-summary" aria-label="Profilio santrauka">
        <span className="tradesperson-avatar" aria-hidden="true">
          {profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : initial}<i />
        </span>
        <strong>{profile.name}</strong>
        {profile.profession ? <p>{profile.profession}</p> : null}
        <span className={`profile-state ${profile.active ? "is-active" : ""}`}>
          <CheckIcon />{profile.active ? "Profilis aktyvus" : "Profilis ruošiamas"}
        </span>
      </section>
      <TradespersonNavigation deletionPending={deletionPending} />
      <div className="tradesperson-logout"><Logout /></div>
    </aside>
    <div className="tradesperson-main">
      <div className="tradesperson-desktop-language"><LanguageSwitcher /></div>
      <header>
        <Link className="brand" href="/"><LocalProBrand iconOnly /></Link>
        <strong>{profile.name}</strong><LanguageSwitcher />
      </header>
      <main>{deletionPending ? <div className="deletion-pending-banner" role="status">Paskyros ištrynimas suplanuotas. Profilis paslėptas, o pakeitimai išjungti. Ištrynimą galite atšaukti paskyros puslapyje.</div> : null}{children}</main>
    </div>
    <TradespersonNavigation mobile deletionPending={deletionPending} />
  </div>;
}

function Logout() {
  return <form action="/auth/logout" method="post"><button type="submit"><LogoutIcon />Atsijungti</button></form>;
}

export function PortalCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="portal-card"><h2>{title}</h2>{children}</section>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12.5 3.1 3.1L17.5 8" /></svg>;
}

function LogoutIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></svg>;
}
