import Link from "next/link";

export function UnlinkedAccount() {
  return (
    <section className="portal-card unlinked-account">
      <span className="status-badge status-warning">Paskyra nesusieta</span>
      <h1>Ši Google paskyra dar nesusieta su specialisto profiliu.</h1>
      <p>Prisijungimas nesukūrė viešo profilio ir nesuteikė prieigos prie profilio pagal sutampantį el. paštą.</p>
      <div className="portal-actions">
        <Link className="portal-primary" href="/meistras/susieti">Turiu kvietimo nuorodą</Link>
        <Link className="portal-secondary" href="/#register">Registruotis kaip specialistas</Link>
      </div>
    </section>
  );
}
