import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailAuthForm } from "../../components/email-auth-form";
import { createSupabaseAuthClient } from "../../lib/supabase-ssr";

const messages: Record<string, string> = {
  oauth_start: "Nepavyko pradėti „Google“ prisijungimo.",
  oauth_callback: "Nepavyko patvirtinti prisijungimo.",
  configuration: "Prisijungimas laikinai nesukonfigūruotas."
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/meistras";
  const supabase = await createSupabaseAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(next);
  return <main className="login-shell"><section className="login-panel">
    <Link className="brand" href="/" aria-label="LocalPro.lt"><span className="brand-mark" aria-hidden="true">LP</span><span><strong>LocalPro.lt</strong><small>Meistro paskyra</small></span></Link>
    <div className="login-copy"><p className="eyebrow">Meistro paskyra</p><h1>Prisijunkite prie savo profilio</h1><p>Prisijungimas pats nesukuria viešo profilio ir nesusieja paskyros pagal viešą kontaktinį el. paštą.</p></div>
    {params.error ? <p className="admin-message" role="alert">{messages[params.error] ?? "Prisijungti nepavyko."}</p> : null}
    <a className="google-primary-button" href={`/auth/google?next=${encodeURIComponent(next)}`}>Tęsti su Google</a>
    <div className="login-divider"><span>arba el. paštu</span></div>
    <EmailAuthForm next={next} />
    <p className="login-privacy">Naudojame „Supabase Auth“ saugias slapukų sesijas ir PKCE patvirtinimą.</p>
  </section></main>;
}
