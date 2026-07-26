import Link from "next/link";

const navigation = [
  ["/meistras", "Apžvalga", "⌂"],
  ["/meistras/profilis", "Profilis", "○"],
  ["/meistras/nuotraukos", "Nuotraukos", "▣"],
  ["/meistras/paslaugos", "Paslaugos", "✓"],
  ["/meistras/darbo-zona", "Darbo zona", "⌖"],
  ["/meistras/paskyra", "Paskyra", "⚙"]
] as const;

export function TradespersonShell({ children, name }: { children: React.ReactNode; name: string }) {
  return (
    <div className="tradesperson-shell">
      <aside className="tradesperson-sidebar">
        <Link className="brand" href="/"><span className="brand-mark">LP</span><strong>LocalPro.lt</strong></Link>
        <nav aria-label="Meistro paskyra">
          {navigation.map(([href, label, icon]) => <Link href={href} key={href}><span aria-hidden="true">{icon}</span>{label}</Link>)}
        </nav>
        <div className="tradesperson-account"><small>Prisijungta kaip</small><strong>{name}</strong><Logout /></div>
      </aside>
      <div className="tradesperson-main">
        <header><strong>Meistro paskyra</strong><span>{name}</span></header>
        <main>{children}</main>
      </div>
      <nav className="tradesperson-bottom-nav" aria-label="Mobilioji navigacija">
        {navigation.slice(0, 5).map(([href, label, icon]) => <Link href={href} key={href}><span aria-hidden="true">{icon}</span><small>{label}</small></Link>)}
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
