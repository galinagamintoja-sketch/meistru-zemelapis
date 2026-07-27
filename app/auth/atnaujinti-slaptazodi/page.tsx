import { EmailAuthForm } from "../../../components/email-auth-form";
export default function Page() {
  return <main className="login-shell"><section className="login-panel"><div className="login-copy"><h1>Atnaujinti slaptažodį</h1><p>Įveskite naują, bent 10 simbolių slaptažodį.</p></div><EmailAuthForm mode="password" /></section></main>;
}
