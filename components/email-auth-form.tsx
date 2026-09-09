"use client";
import { useState } from "react";

type AuthAction = "sign-in" | "sign-up" | "recovery" | "update-password";

export function authEmailPayload(action: AuthAction, formData: FormData, next: string) {
  const common = { action, next };
  if (action === "recovery") return { ...common, email: formData.get("email") };
  if (action === "update-password") return { ...common, password: formData.get("password") };
  return { ...common, email: formData.get("email"), password: formData.get("password") };
}

export function EmailAuthForm({ mode = "login", next = "/meistras" }: { mode?: "login" | "password"; next?: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function send(action: AuthAction, formData: FormData) {
    if (pending) return;
    setPending(true);
    setMessage("Prašymas siunčiamas...");
    try {
      const response = await fetch("/api/auth/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(authEmailPayload(action, formData, next)) });
      const data = await response.json().catch(() => null) as { redirectTo?: string; message?: string; error?: string } | null;
      if (response.ok && data?.redirectTo) window.location.assign(data.redirectTo);
      else setMessage(response.ok ? data?.message ?? "Veiksmas atliktas." : data?.error ?? "Veiksmas nepavyko. Bandykite dar kartą.");
    } catch {
      setMessage("Nepavyko prisijungti prie serverio. Patikrinkite ryšį ir bandykite dar kartą.");
    } finally {
      setPending(false);
    }
  }
  if (mode === "password") return <form className="portal-form" action={(data) => send("update-password", data)}><label>Naujas slaptažodis<input name="password" type="password" minLength={10} autoComplete="new-password" required disabled={pending} /></label><button className="portal-primary" type="submit" disabled={pending}>{pending ? "Išsaugoma..." : "Išsaugoti naują slaptažodį"}</button><p role="status">{message}</p></form>;
  return <form className="portal-form" action={(data) => send("sign-in", data)}>
    <label>El. paštas<input name="email" type="email" autoComplete="email" required /></label>
    <label>Slaptažodis<input name="password" type="password" minLength={10} autoComplete="current-password" required /></label>
    <button className="portal-primary" type="submit" disabled={pending}>Prisijungti el. paštu</button>
    <button className="portal-secondary" type="submit" disabled={pending} formAction={(data) => send("sign-up", data)}>Sukurti paskyrą</button>
    <button className="text-button" type="submit" disabled={pending} formNoValidate formAction={(data) => send("recovery", data)}>Pamiršau slaptažodį</button><p role="status">{message}</p>
  </form>;
}
