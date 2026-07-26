import Link from "next/link";

const navigation = [
  ["/meistras/uzklausos", "Užklausos", "✉"],
  ["/meistras/profilis", "Mano profilis", "○"],
  ["/meistras/nuotraukos", "Nuotraukos", "▣"],
  ["/meistras/paslaugos", "Paslaugos", "✓"],
  ["/meistras/paskyra", "Paskyra", "⚙"]
] as const;

export function TradespersonShell({ children, name }: { children: React.ReactNode; name: string }) {
  return (
    <div className="tradesperson-shell">
      <aside className="tradesperson-sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">LP</span>
          <span><strong>LocalPro.lt</strong><small>Meistro paskyra</small></span>
        </Link>
        <nav aria-label="Meistro paskyra">
          {navigation.map(([href, label, icon]) => <Link href={href} key={href}><span aria-hidden="true">{icon}</span>{label}</Link>)}
        </nav>
        <div className="tradesperson-account"><small>Prisijungta kaip</small><strong>{name}</strong><Logout /></div>
      </aside>
      <div className="tradesperson-main">
        <header><Link className="brand" href="/"><span className="brand-mark">LP</span><strong>LocalPro.lt</strong></Link><span>{name}</span></header>
        <main>{children}</main>
      </div>
      <nav className="tradesperson-bottom-nav" aria-label="Mobilioji navigacija">
        {navigation.map(([href, label, icon]) => <Link href={href} key={href}><span aria-hidden="true">{icon}</span><small>{label === "Mano profilis" ? "Profilis" : label}</small></Link>)}
      </nav>
    </div>
  );
}

function Logout() {
  return <form action="/auth/logout" method="post"><button type="submit">Atsijungti</button></form>;
}

export function PortalCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="portal-card"><h2>{title}</h2>{children}</section>;
}
