"use client";
import { useState } from "react";

export function EmailAuthForm({ mode = "login", next = "/meistras" }: { mode?: "login" | "password"; next?: string }) {
  const [message, setMessage] = useState("");
  async function send(action: string, formData: FormData) {
    setMessage("Prašymas siunčiamas...");
    const response = await fetch("/api/auth/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, email: formData.get("email"), password: formData.get("password"), next }) });
    const data = await response.json();
    if (response.ok && data.redirectTo) window.location.assign(data.redirectTo);
    else setMessage(response.ok ? data.message : data.error ?? "Veiksmas nepavyko.");
  }
  if (mode === "password") return <form className="portal-form" action={(data) => send("update-password", data)}><label>Naujas slaptažodis<input name="password" type="password" minLength={10} autoComplete="new-password" required /></label><button className="portal-primary" type="submit">Išsaugoti naują slaptažodį</button><p role="status">{message}</p></form>;
  return <form className="portal-form" action={(data) => send("sign-in", data)}>
    <label>El. paštas<input name="email" type="email" autoComplete="email" required /></label>
    <label>Slaptažodis<input name="password" type="password" minLength={10} autoComplete="current-password" required /></label>
    <button className="portal-primary" type="submit">Prisijungti el. paštu</button>
    <button className="portal-secondary" type="submit" formAction={(data) => send("sign-up", data)}>Sukurti paskyrą</button>
    <button className="text-button" type="submit" formNoValidate formAction={(data) => send("recovery", data)}>Pamiršau slaptažodį</button><p role="status">{message}</p>
  </form>;
}
