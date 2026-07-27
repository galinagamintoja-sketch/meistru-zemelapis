import Link from "next/link";

export function UnlinkedAccount() {
  return (
    <section className="portal-card unlinked-account">
      <span className="status-badge status-warning">Užbaikite registraciją</span>
      <h1>Sukurkite savo LocalPro specialisto profilį.</h1>
      <p>Profilis bus saugiai susietas su šia paskyra ir taps aktyvus, kai užpildysite privalomus laukus.</p>
      <div className="portal-actions">
        <Link className="portal-primary" href="/?register=1#register">Užbaigti registraciją</Link>
      </div>
    </section>
  );
}
