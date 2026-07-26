import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAuthClient } from "../../lib/supabase-ssr";

const messages: Record<string, string> = {
  oauth_start: "Nepavyko pradėti „Google“ prisijungimo.",
  oauth_callback: "Nepavyko patvirtinti „Google“ prisijungimo.",
  configuration: "Prisijungimas laikinai nesukonfigūruotas."
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/meistras");

  return (
    <main className="login-shell">
      <section className="login-panel">
        <Link className="brand" href="/" aria-label="LocalPro.lt">
          <span className="brand-mark" aria-hidden="true">LP</span>
          <span><strong>LocalPro.lt</strong><small>Meistro paskyra</small></span>
        </Link>
        <div className="login-copy">
          <p className="eyebrow">Meistro paskyra</p>
          <h1>Prisijunkite prie savo profilio</h1>
          <p>Naudokite savo „Google“ paskyrą. Nauja vieša anketa vien dėl prisijungimo nebus sukurta.</p>
        </div>
        {params.error ? <p className="admin-message" role="alert">{messages[params.error] ?? "Prisijungti nepavyko."}</p> : null}
        <a className="google-primary-button" href="/auth/google">Tęsti su Google</a>
        <p className="login-privacy">Prisijungimui naudojame „Supabase Auth“. „Google“ slaptažodžio LocalPro nemato ir nesaugo.</p>
      </section>
    </main>
  );
}
