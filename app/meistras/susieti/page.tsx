import { PortalCard } from "../../../components/tradesperson-shell";

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <div className="portal-page">
      <div className="portal-heading"><h1>Susieti specialisto profilį</h1><p>Naudokite administratoriaus atsiųstą vienkartinę kvietimo nuorodą.</p></div>
      <PortalCard title="Kvietimo kodas">
        {params.error ? <p role="alert">Kvietimo nuoroda negalioja, jau panaudota arba jos galiojimas pasibaigė.</p> : null}
        <form className="portal-page" action="/api/meistras/claim" method="post">
          <label htmlFor="token">Kvietimo kodas</label>
          <input id="token" name="token" defaultValue={params.token ?? ""} required minLength={32} autoComplete="off" />
          <button className="portal-primary" type="submit">Susieti profilį</button>
        </form>
      </PortalCard>
    </div>
  );
}
