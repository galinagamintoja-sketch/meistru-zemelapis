import Link from "next/link";
import { TradespersonNavigation } from "./tradesperson-navigation";

type ShellProfile = { name: string; profession?: string | null; active: boolean; photoUrl?: string | null };

export function TradespersonShell({ children, profile, deletionPending = false }: { children: React.ReactNode; profile: ShellProfile; deletionPending?: boolean }) {
  const initial = profile.name.trim().charAt(0).toLocaleUpperCase("lt-LT") || "M";
  return <div className="tradesperson-shell">
    <aside className="tradesperson-sidebar">
      <Link className="brand" href="/">
        <span className="brand-mark">LP</span>
        <span><strong>LocalPro.lt</strong><small>Meistrų žemėlapis</small></span>
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
      <header>
        <Link className="brand" href="/"><span className="brand-mark">LP</span><strong>LocalPro.lt</strong></Link>
        <strong>{profile.name}</strong><span className="mobile-header-action"><BellIcon /></span>
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

function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-label="Pranešimai"><path d="M6.5 17.5h11l-1.4-2V10a4.1 4.1 0 0 0-8.2 0v5.5zM10 20h4" /></svg>;
}

function LogoutIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></svg>;
}
