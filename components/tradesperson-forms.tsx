"use client";

import { useState } from "react";

type ProfileValues = { displayName: string; companyName: string; phone: string; whatsappNumber: string; publicEmail: string; description: string };

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    setMessage("Saugoma...");
    const response = await fetch("/api/meistras/profile", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData))
    });
    const data = await response.json();
    setMessage(response.ok ? "Profilis išsaugotas." : data.error ?? "Išsaugoti nepavyko.");
  }
  return <form className="portal-form" action={submit}>
    <label>Vardas arba veiklos pavadinimas<input name="displayName" defaultValue={initial.displayName} required /></label>
    <label>Įmonė<input name="companyName" defaultValue={initial.companyName} /></label>
    <div className="portal-form-row"><label>Telefonas<input name="phone" defaultValue={initial.phone} required /></label><label>WhatsApp<input name="whatsappNumber" defaultValue={initial.whatsappNumber} /></label></div>
    <label>Viešas kontaktinis el. paštas<input type="email" name="publicEmail" defaultValue={initial.publicEmail} required /><small>Tai nėra „Google“ prisijungimo el. paštas.</small></label>
    <label>Aprašymas<textarea name="description" defaultValue={initial.description} minLength={40} rows={7} required /></label>
    <button className="portal-primary" type="submit">Išsaugoti profilį</button><p role="status">{message}</p>
  </form>;
}

export function ServicesForm({ groups, selected }: { groups: Array<{ name: string; items: Array<{ id: string; name: string }> }>; selected: string[] }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const response = await fetch("/api/meistras/services", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ subcategoryIds: formData.getAll("subcategoryIds") }) });
    const data = await response.json(); setMessage(response.ok ? "Paslaugos išsaugotos." : data.error ?? "Išsaugoti nepavyko.");
  }
  return <form className="portal-form" action={submit}>{groups.map((group) => <fieldset key={group.name}><legend>{group.name}</legend><div className="portal-checks">{group.items.map((item) => <label key={item.id}><input type="checkbox" name="subcategoryIds" value={item.id} defaultChecked={selected.includes(item.id)} />{item.name}</label>)}</div></fieldset>)}<button className="portal-primary" type="submit">Išsaugoti paslaugas</button><p role="status">{message}</p></form>;
}

export function AreasForm({ baseCity, radiusKm, cities }: { baseCity: string; radiusKm: number; cities: string[] }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const cityList = String(formData.get("cities") ?? "").split(",").map((city) => city.trim()).filter(Boolean);
    const response = await fetch("/api/meistras/areas", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseCity: formData.get("baseCity"), radiusKm: formData.get("radiusKm"), cities: cityList }) });
    const data = await response.json(); setMessage(response.ok ? "Darbo zona išsaugota." : data.error ?? "Išsaugoti nepavyko.");
  }
  return <form className="portal-form" action={submit}><label>Pagrindinis miestas<input name="baseCity" defaultValue={baseCity} required /></label><label>Aptarnaujami miestai<input name="cities" defaultValue={cities.join(", ")} required /><small>Atskirkite miestus kableliais.</small></label><label>Atstumas (km)<input name="radiusKm" type="number" min="1" max="200" defaultValue={radiusKm} required /></label><button className="portal-primary" type="submit">Išsaugoti darbo zoną</button><p role="status">{message}</p></form>;
}

export function LoginEmailForm({ email }: { email: string }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const response = await fetch("/api/meistras/login-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: formData.get("email") }) });
    const data = await response.json(); setMessage(response.ok ? data.message ?? "Pakeitimų nėra." : data.error ?? "Pakeisti nepavyko.");
  }
  return <form className="portal-form" action={submit}><label>Prisijungimo el. paštas<input type="email" name="email" defaultValue={email} required /><small>Pakeitimas įsigalios tik patvirtinus el. paštą per „Supabase Auth“.</small></label><button className="portal-secondary" type="submit">Keisti prisijungimo el. paštą</button><p role="status">{message}</p></form>;
}
