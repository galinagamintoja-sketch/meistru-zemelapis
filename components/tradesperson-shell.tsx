import Link from "next/link";
import { TradespersonNavigation } from "./tradesperson-navigation";

type ShellProfile = { name: string; subtitle?: string | null; active: boolean };

export function TradespersonShell({ children, profile }: { children: React.ReactNode; profile: ShellProfile }) {
  const initial = profile.name.trim().charAt(0).toLocaleUpperCase("lt-LT") || "M";
  return <div className="tradesperson-shell">
    <aside className="tradesperson-sidebar">
      <Link className="brand" href="/">
        <span className="brand-mark">LP</span>
        <span><strong>LocalPro.lt</strong><small>Meistrų žemėlapis</small></span>
      </Link>
      <section className="tradesperson-summary" aria-label="Profilio santrauka">
        <span className="tradesperson-avatar" aria-hidden="true">{initial}<i /></span>
        <strong>{profile.name}</strong>
        {profile.subtitle ? <p>{profile.subtitle}</p> : null}
        <span className={`profile-state ${profile.active ? "is-active" : ""}`}>
          <span aria-hidden="true">✓</span>{profile.active ? "Profilis aktyvus" : "Profilis ruošiamas"}
        </span>
      </section>
      <TradespersonNavigation />
      <div className="tradesperson-logout"><Logout /></div>
    </aside>
    <div className="tradesperson-main">
      <header>
        <Link className="brand" href="/"><span className="brand-mark">LP</span><strong>LocalPro.lt</strong></Link>
        <strong>{profile.name}</strong><span className="mobile-header-action" aria-hidden="true">⌁</span>
      </header>
      <main>{children}</main>
    </div>
    <TradespersonNavigation mobile />
  </div>;
}

function Logout() {
  return <form action="/auth/logout" method="post"><button type="submit"><span aria-hidden="true">↪</span>Atsijungti</button></form>;
}

export function PortalCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="portal-card"><h2>{title}</h2>{children}</section>;
}
