import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAuthClient } from "../../lib/supabase-ssr";
import { safeAuthNext } from "../../lib/safe-auth-next";
import type { Metadata } from "next";
import LocalProBrand from "../../components/LocalProBrand";
import { isAdminEmail } from "../../lib/auth-session";

export const metadata: Metadata = {
  title: "Prisijungimas | LocalPro",
  description: "Saugiai prisijunkite prie savo LocalPro meistro paskyros.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true }
};

const messages: Record<string, string> = {
  oauth_start: "Nepavyko pradėti „Google“ prisijungimo.",
  oauth_callback: "Nepavyko patvirtinti prisijungimo.",
  configuration: "Prisijungimas laikinai nesukonfigūruotas."
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const next = safeAuthNext(params.next);
  const forJobs = next.startsWith("/darbu-skelbimai");
  const supabase = await createSupabaseAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect((next === "/admin" || next.startsWith("/admin/")) && !isAdminEmail(user.email) ? "/" : next);
  return <main className="login-shell"><section className="login-panel">
    <Link className="brand" href="/" aria-label="LocalPro.lt"><LocalProBrand priority /></Link>
    <div className="login-copy"><p className="eyebrow">LocalPro paskyra</p><h1>Prisijunkite arba registruokitės</h1><p>{forJobs ? "Prisijungę galėsite tęsti darbų skelbimų peržiūrą. Meistro profilio kurti nereikia." : "Po pirmo prisijungimo užpildysite trumpą registraciją. LocalPro sukurs naują specialisto profilį ir saugiai susies jį su jūsų paskyra."}</p></div>
    {params.error ? <p className="admin-message" role="alert">{messages[params.error] ?? "Prisijungti nepavyko."}</p> : null}
    <a className="google-primary-button" href={`/auth/google?next=${encodeURIComponent(next)}`}>Tęsti su Google</a>
  </section></main>;
}
