"use client";

import { useMemo, useState } from "react";
import AddressAutocomplete, { type AddressValue } from "./AddressAutocomplete";

type ProfileValues = { displayName: string; companyName: string; primaryCategoryId: string; experienceYears: number; phone: string; whatsappNumber: string; publicEmail: string; description: string; languages: string[]; publicContactConsent: boolean };

export function ProfileForm({ initial, categories }: { initial: ProfileValues; categories: Array<{ id: string; name: string }> }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    setMessage("Saugoma...");
    const response = await fetch("/api/meistras/profile", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(formData), languages: String(formData.get("languages") ?? "").split(",").map((value) => value.trim()).filter(Boolean), publicContactConsent: formData.get("publicContactConsent") === "on" })
    });
    const data = await response.json();
    setMessage(response.ok ? "Profilis išsaugotas." : data.error ?? "Išsaugoti nepavyko.");
  }
  return <form className="portal-form" action={submit}>
    <label>Vardas ir pavardė<input name="displayName" defaultValue={initial.displayName} required /></label>
    <label>Įmonės arba veiklos pavadinimas<input name="companyName" defaultValue={initial.companyName} /></label>
    <div className="portal-form-row"><label>Pagrindinė specialybė<select name="primaryCategoryId" defaultValue={initial.primaryCategoryId} required>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>Patirties metai<input name="experienceYears" type="number" min="0" max="80" defaultValue={initial.experienceYears} required /></label></div>
    <div className="portal-form-row"><label>Viešas telefono numeris<input name="phone" defaultValue={initial.phone} required /></label><label>WhatsApp numeris<input name="whatsappNumber" defaultValue={initial.whatsappNumber} /></label></div>
    <label>Viešas kontaktinis el. paštas<input type="email" name="publicEmail" defaultValue={initial.publicEmail} required /><small>Tai nėra „Google“ prisijungimo el. paštas.</small></label>
    <label>Trumpas aprašymas<textarea name="description" defaultValue={initial.description} minLength={40} rows={7} required /></label>
    <label>Kalbos (nebūtina)<input name="languages" defaultValue={initial.languages.join(", ")} placeholder="Lietuvių, anglų, lenkų" /><small>Atskirkite kableliais.</small></label>
    <label className="portal-consent"><input type="checkbox" name="publicContactConsent" defaultChecked={initial.publicContactConsent} /><span>Sutinku, kad viešame profilyje būtų rodomi mano pasirinkti kontaktiniai duomenys.</span></label>
    <button className="portal-primary" type="submit">Išsaugoti profilį</button><p role="status">{message}</p>
  </form>;
}

type ServiceGroup = { id: string; name: string; items: Array<{ id: string; name: string }> };

export function ServicesForm({ groups, selected, location }: {
  groups: ServiceGroup[];
  selected: string[];
  location: AddressValue & { baseCity: string; radiusKm: number };
}) {
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(selected);
  const [address, setAddress] = useState<AddressValue>(location);
  const selectedCategoryIds = useMemo(() => new Set(groups.filter((group) => group.items.some((item) => selectedIds.includes(item.id))).map((group) => group.id)), [groups, selectedIds]);
  const chosen = groups.flatMap((group) => group.items).filter((item) => selectedIds.includes(item.id));

  function toggle(groupId: string, itemId: string) {
    if (selectedIds.includes(itemId)) return setSelectedIds((items) => items.filter((id) => id !== itemId));
    if (selectedIds.length >= 15) return setMessage("Galima pasirinkti daugiausia 15 paslaugų.");
    if (!selectedCategoryIds.has(groupId) && selectedCategoryIds.size >= 3) return setMessage("Galima pasirinkti daugiausia 3 kategorijas.");
    setSelectedIds((items) => [...items, itemId]);
    setMessage("");
  }

  async function submit(formData: FormData) {
    setMessage("Saugoma...");
    const [servicesResponse, areaResponse] = await Promise.all([
      fetch("/api/meistras/services", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ subcategoryIds: selectedIds }) }),
      fetch("/api/meistras/areas", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
        baseCity: formData.get("baseCity"), registeredAddress: address.address, googlePlaceId: address.placeId,
        latitude: address.latitude, longitude: address.longitude, radiusKm: formData.get("radiusKm")
      }) })
    ]);
    const failed = !servicesResponse.ok ? await servicesResponse.json() : !areaResponse.ok ? await areaResponse.json() : null;
    setMessage(failed ? failed.error ?? "Išsaugoti nepavyko." : "Paslaugos ir darbo zona išsaugotos.");
  }

  return <form className="portal-form services-editor" action={submit}>
    <section><h3>Paslaugos</h3>
      <label>Ieškoti paslaugos<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ieškoti paslaugos" /></label>
      <div className="selected-service-tags">{chosen.map((item) => <button type="button" key={item.id} onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== item.id))}>{item.name} ×</button>)}</div>
      <small>Pasirinkta {selectedIds.length} iš 15 paslaugų · {selectedCategoryIds.size} iš 3 kategorijų</small>
      <div className="service-accordions">{groups.map((group) => {
        const visible = group.items.filter((item) => item.name.toLocaleLowerCase("lt").includes(query.toLocaleLowerCase("lt")));
        if (query && !visible.length) return null;
        return <details key={group.id} open={Boolean(query)}><summary>{group.name}<span>{group.items.filter((item) => selectedIds.includes(item.id)).length}</span></summary><div className="portal-checks">{visible.map((item) => <label key={item.id}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggle(group.id, item.id)} />{item.name}</label>)}</div></details>;
      })}</div>
    </section>
    <section><h3>Darbo vieta ir spindulys</h3>
      <label>Pagrindinis miestas<input name="baseCity" defaultValue={location.baseCity} required /></label>
      <AddressAutocomplete label="Privatus darbo bazės adresas" value={address} onChange={setAddress} required />
      <small>Tikslus adresas ir koordinatės yra privatūs. Klientai mato tik bendrą vietovę ir aptarnavimo zoną.</small>
      <label>Vienas paslaugų spindulys<select name="radiusKm" defaultValue={location.radiusKm}>{[5,10,20,30,50,75,100].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}<option value="150">Visa Lietuva</option></select></label>
    </section>
    <button className="portal-primary" type="submit">Išsaugoti paslaugas</button><p role="status">{message}</p>
  </form>;
}

export function LoginEmailForm({ email }: { email: string }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    const response = await fetch("/api/meistras/login-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: formData.get("email") }) });
    const data = await response.json(); setMessage(response.ok ? data.message ?? "Pakeitimų nėra." : data.error ?? "Pakeisti nepavyko.");
  }
  return <form className="portal-form" action={submit}><label>Prisijungimo el. paštas<input type="email" name="email" defaultValue={email} required /><small>Pakeitimas įsigalios tik patvirtinus el. paštą per „Supabase Auth“.</small></label><button className="portal-secondary" type="submit">Keisti prisijungimo el. paštą</button><p role="status">{message}</p></form>;
}
