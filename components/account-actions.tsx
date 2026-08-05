"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Deletion = { status: string; scheduledDeletionAt: string | null } | null;

export function AccountActions({ hasPassword, email, initialDeletion }: { hasPassword: boolean; email: string; initialDeletion: Deletion }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [deletion, setDeletion] = useState<Deletion>(initialDeletion);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function requestExport() {
    setPending(true);
    const response = await fetch("/api/meistras/account-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "data_export" }) });
    const data = await response.json();
    setMessage(response.ok ? data.message : data.error ?? "Prašymo pateikti nepavyko.");
    setPending(false);
  }

  async function scheduleDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    const response = await fetch("/api/meistras/account-requests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "account_deletion", confirmationEmail: form.get("confirmationEmail"), understandsPermanentDeletion: form.get("understandsPermanentDeletion") === "on" })
    });
    const data = await response.json();
    if (response.ok) {
      setDeletion({ status: data.deletion.status, scheduledDeletionAt: data.deletion.scheduledDeletionAt });
      setConfirming(false); setMessage("");
      router.refresh();
    } else setMessage(data.error ?? "Paskyros ištrynimo suplanuoti nepavyko.");
    setPending(false);
  }

  async function cancelDeletion() {
    setPending(true);
    const response = await fetch("/api/meistras/account-requests", { method: "DELETE" });
    const data = await response.json();
    if (response.ok) { setDeletion(null); router.refresh(); }
    setMessage(response.ok ? data.message : data.error ?? "Paskyros ištrynimo atšaukti nepavyko.");
    setPending(false);
  }

  async function recovery(formData: FormData) {
    const response = await fetch("/api/auth/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recovery", email: formData.get("email") }) });
    const data = await response.json(); setMessage(response.ok ? data.message : data.error);
  }

  return <div className="portal-form">
    {!deletion && hasPassword ? <form action={recovery}><input type="hidden" name="email" value={email} /><button className="portal-secondary" type="submit">Keisti arba atkurti slaptažodį</button></form> : null}
    {!deletion && !hasPassword ? <p>Slaptažodžio nėra – ši paskyra prijungta per išorinį teikėją.</p> : null}
    <button className="portal-secondary" type="button" disabled={pending} onClick={() => void requestExport()}>Prašyti savo duomenų kopijos</button>
    <section className="account-deletion-section" aria-labelledby="account-deletion-title">
      <h3 id="account-deletion-title">Visam laikui ištrinti paskyrą</h3>
      {deletion ? <>
        <p><strong>Jūsų profilis paslėptas.</strong> Paskyra bus visam laikui ištrinta {formatDeletionDate(deletion.scheduledDeletionAt)}. Iki tos dienos ištrynimą galite atšaukti.</p>
        {deletion.status === "failed" ? <p>Ištrynimo vykdymas laikinai nepavyko. Profilis lieka paslėptas, o sistema bandys dar kartą.</p> : null}
        <button className="portal-secondary" type="button" disabled={pending || deletion.status === "processing"} onClick={() => void cancelDeletion()}>Atšaukti paskyros ištrynimą</button>
      </> : <>
        <p>Jūsų profilis bus iš karto paslėptas. Po 7 dienų paskyra, kontaktiniai duomenys, paslaugos ir darbų nuotraukos bus visam laikui ištrinti. Iki tol galėsite ištrynimą atšaukti.</p>
        {!confirming ? <button className="danger-button" type="button" onClick={() => setConfirming(true)}>Ištrinti paskyrą</button> :
          <form className="deletion-confirmation" aria-label="Patvirtinti paskyros ištrynimą" onSubmit={scheduleDeletion}>
            <p>Patvirtinimui įveskite dabartinį prisijungimo el. paštą.</p>
            <label>Prisijungimo el. paštas<input name="confirmationEmail" type="email" autoComplete="email" required /></label>
            <label className="checkbox-line"><input name="understandsPermanentDeletion" type="checkbox" required /> Suprantu, kad po 7 dienų paskyros ištrynimas bus negrįžtamas.</label>
            <div className="portal-actions"><button className="danger-button" type="submit" disabled={pending}>Patvirtinti paskyros ištrynimą</button><button className="portal-secondary" type="button" onClick={() => setConfirming(false)}>Grįžti</button></div>
          </form>}
      </>}
    </section>
    <a href="mailto:pagalba@localpro.lt">Susisiekti su pagalba</a><p role="status">{message}</p>
  </div>;
}

function formatDeletionDate(value: string | null) {
  if (!value) return "serverio nustatytą dieną";
  return new Intl.DateTimeFormat("lt-LT", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Vilnius" }).format(new Date(value));
}
