"use client";
import { useState } from "react";

export function AccountActions({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const [message, setMessage] = useState("");
  async function request(type: "data_export" | "account_deletion") {
    if (type === "account_deletion" && !window.confirm("Ar tikrai norite pateikti paskyros ištrynimo prašymą? Profilis nebus ištrintas automatiškai.")) return;
    const response = await fetch("/api/meistras/account-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type }) });
    const data = await response.json(); setMessage(response.ok ? data.message : data.error ?? "Prašymo pateikti nepavyko.");
  }
  async function recovery(formData: FormData) {
    const response = await fetch("/api/auth/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recovery", email: formData.get("email") }) });
    const data = await response.json(); setMessage(response.ok ? data.message : data.error);
  }
  return <div className="portal-form">
    {hasPassword ? <form action={recovery}><input type="hidden" name="email" value={email} /><button className="portal-secondary" type="submit">Keisti arba atkurti slaptažodį</button></form> : <p>Slaptažodžio nėra – ši paskyra prijungta per išorinį teikėją.</p>}
    <button className="portal-secondary" type="button" onClick={() => void request("data_export")}>Prašyti savo duomenų kopijos</button>
    <button className="danger-button" type="button" onClick={() => void request("account_deletion")}>Prašyti ištrinti paskyrą</button>
    <a href="mailto:pagalba@localpro.lt">Susisiekti su pagalba</a><p role="status">{message}</p>
  </div>;
}
