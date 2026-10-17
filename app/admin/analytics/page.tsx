import Link from "next/link";
import { redirect } from "next/navigation";
import { getGoogleReportingSnapshot } from "../../../lib/google-reporting";
import { getReportingAdminSession, reportingRequestAllowed } from "../../../lib/reporting-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const metadata = { title: "Privati statistika | LocalPro", robots: { index: false, follow: false } };
export default async function AnalyticsPage() {
  if (!await getReportingAdminSession()) redirect("/login?next=%2Fadmin%2Fanalytics");
  if (!reportingRequestAllowed("admin")) return <main><h1>Statistika</h1><p>Per daug užklausų. Pabandykite po minutės.</p></main>;
  const snapshot = await getGoogleReportingSnapshot({ window: "28d", includeConversions: true });
  const ga = snapshot.ga4;
  const search = snapshot.searchConsole;
  const funnel = snapshot.archiveFunnel;
  const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
  const stepLabels = ["Archyvo apsilankymas", "Registracijos pasiūlymas", "Registracijos paspaudimas", "Užbaigta nauja registracija"];
  return <main style={{ maxWidth: 1050, margin: "40px auto", padding: 20 }}>
    <Link href="/admin">← Administravimas</Link><h1>LocalPro privati statistika</h1>
    <p>28 kalendorinių dienų langas. Datos parenkamos pagal UTC laikrodį; GA4 jas interpretuoja pagal nuosavybės laiko juostą, o „Search Console“ – pagal savo ataskaitų laiko juostą. GA4 langas baigiasi vakar (UTC), paieškos langas – prieš tris dienas (UTC).</p>
    <p>Tuščias sėkmingas atsakymas nėra autentifikavimo klaida. GA4 duomenys apima tik sutikusius lankytojus ir gali vėluoti.</p>
    <section><h2>GA4</h2>{ga.status === "error" ? <p>Duomenų nepavyko gauti: {ga.error.code}</p> : ga.empty ? <p>Prieiga veikia; šio laikotarpio duomenų dar nėra.</p> : <table><caption>Dienos duomenys; aktyvių naudotojų neskaičiuojame sumuodami dienas.</caption><thead><tr><th>Data</th><th>Aktyvūs naudotojai</th><th>Sesijos</th><th>Įvykiai</th></tr></thead><tbody>{ga.data.rows.map(row => <tr key={row.date}><td>{row.date}</td><td>{row.activeUsers}</td><td>{row.sessions}</td><td>{row.eventCount}</td></tr>)}</tbody></table>}</section>
    <section><h2>„Search Console“</h2>{search.status === "error" ? <p>Duomenų nepavyko gauti: {search.error.code}</p> : search.empty ? <p>Prieiga veikia; šio laikotarpio paieškos duomenų nėra.</p> : <table><thead><tr><th>Data</th><th>Paspaudimai</th><th>Parodymai</th><th>CTR</th><th>Pozicija</th></tr></thead><tbody>{search.data.rows.map(row => <tr key={row.date}><td>{row.date}</td><td>{row.clicks}</td><td>{row.impressions}</td><td>{(row.ctr * 100).toFixed(2)}%</td><td>{row.position.toFixed(2)}</td></tr>)}</tbody></table>}</section>
    {[{ title: "GA4 realiuoju laiku", result: snapshot.realtime }, { title: "Užklausos, registracijos ir kontaktų paspaudimai", result: snapshot.conversions }].map(({ title, result }) => <section key={title}><h2>{title}</h2>{result?.status === "success" ? result.empty ? <p>Prieiga veikia; įvykių nėra.</p> : <ul>{result.data.rows.map(row => <li key={row.eventName}>{row.eventName}: {row.eventCount}</li>)}</ul> : <p>Duomenų nepavyko gauti: {result?.status === "error" ? result.error.code : "NOT_CHECKED"}</p>}</section>)}
    <p>generate_lead – sėkmingai pateikta užklausa; sign_up – užbaigta meistro registracija; contact_click – tik telefono arba el. pašto paspaudimas, ne užbaigtas užsakymas. Įvykių pateikimą kaip GA4 pagrindinius įvykius atskirai valdo savininkas.</p>
    <section><h2>„Facebook“ archyvas → nauja registracija</h2>
      <p>Uždaras, nuoseklus GA4 naudotojų piltuvas: įskaitomi tik pradėję nuo archyvo apsilankymo ir eilės tvarka pasiekę kitus etapus. Tarp gretimų etapų – ne daugiau kaip 30 min.; kiti įvykiai tarp jų leidžiami.</p>
      <p>Tik sutikusių naršyklių įvykiai; tai nėra tikslus realių žmonių skaičius. To paties skirtuko kelionę riboja kliento priskyrimas, o GA4 vertina to paties naudotojo seką – negarantuoja vienos GA4 sesijos ar vienos kelionės. Duomenys gali vėluoti, būti ribojami ar imami iš imties.</p>
      {funnel.status === "error" ? <p role="status">Piltuvo duomenų nepavyko gauti: {funnel.error.code}. {funnel.error.code === "UNSUPPORTED" ? "GA4 alpha piltuvo API nepasiekiama arba nepalaikoma." : funnel.error.code === "FORBIDDEN" ? "Patikrinkite skaitymo prieigą prie GA4 piltuvo ataskaitų." : "Tai nėra tuščia sėkminga ataskaita."}</p> : <>
        <p>Pasirinktas 28 dienų langas: {funnel.data.dateRange.startDate} – {funnel.data.dateRange.endDate} (UTC parinktos datos, GA4 nuosavybės laiko juosta). {funnel.data.sampled ? "Ataskaita paremta duomenų imtimi." : ""}</p>
        {funnel.empty && <p>Prieiga veikia; šio laikotarpio piltuvo duomenų dar nėra.</p>}
        <table><caption>Viso laikotarpio aktyvūs GA4 naudotojai pagal nuosekliai pasiektą etapą, ne įvykių sumos.</caption><thead><tr><th>Etapas</th><th>Aktyvūs naudotojai</th><th>Į kitą etapą</th><th>Atkritimas iki kito etapo</th></tr></thead><tbody>{funnel.data.rows.map((row, i) => <tr key={row.eventName}><th scope="row">{i + 1}. {stepLabels[i]}</th><td>{row.activeUsers}</td><td>{percent(row.completionRateToNext)}</td><td>{percent(row.dropoffRateToNext)}</td></tr>)}</tbody></table>
        <p>Archyvas → registracijos paspaudimas: {percent(funnel.data.archiveToClickRate)}. Archyvas → užbaigta nauja registracija: {percent(funnel.data.archiveToCompletedRate)}.</p>
      </>}
    </section>
  </main>;
}
