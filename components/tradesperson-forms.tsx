"use client";

import { useState } from "react";
import AddressAutocomplete, { type AddressValue } from "./AddressAutocomplete";
import { MAX_PROFILE_CATEGORIES, MAX_PROFILE_SERVICES, selectionCounter, uniqueServices } from "../lib/service-taxonomy";

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
  return <form className="portal-form profile-editor" action={submit}>
    <div className="profile-editor-grid">
      <section><h3><SectionIcon path="M6 20v-2a6 6 0 0 1 12 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />Pagrindinė informacija</h3>
        <label>Vardas ir pavardė<input name="displayName" defaultValue={initial.displayName} required /></label>
        <label>Įmonės arba veiklos pavadinimas<input name="companyName" defaultValue={initial.companyName} /></label>
        <label>Pagrindinė specialybė<select name="primaryCategoryId" defaultValue={initial.primaryCategoryId} required>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <label>Patirties metai<input name="experienceYears" type="number" min="0" max="80" defaultValue={initial.experienceYears} required /></label>
        <label>Trumpas aprašymas<textarea name="description" defaultValue={initial.description} minLength={40} rows={7} required /></label>
      </section>
      <section><h3><SectionIcon path="M8 4H5a2 2 0 0 0-2 2c0 8.3 6.7 15 15 15a2 2 0 0 0 2-2v-3l-4-1-1.5 2a13 13 0 0 1-7.5-7.5L9 8z" />Kontaktai</h3>
        <label>Viešas telefono numeris<input name="phone" defaultValue={initial.phone} required /></label>
        <label>WhatsApp numeris<input name="whatsappNumber" defaultValue={initial.whatsappNumber} /></label>
        <label>Viešas kontaktinis el. paštas<input type="email" name="publicEmail" defaultValue={initial.publicEmail} required /><small>Tai nėra „Google“ prisijungimo el. paštas.</small></label>
        <label>Kalbos (nebūtina)<input name="languages" defaultValue={initial.languages.join(", ")} placeholder="Lietuvių, anglų, lenkų" /><small>Atskirkite kableliais.</small></label>
        <label className="portal-consent"><input type="checkbox" name="publicContactConsent" defaultChecked={initial.publicContactConsent} /><span>Sutinku, kad viešame profilyje būtų rodomi mano pasirinkti kontaktiniai duomenys.</span></label>
      </section>
    </div>
    <div className="profile-editor-actions"><button className="portal-primary" type="submit">Išsaugoti pakeitimus</button><p role="status">{message}</p></div>
  </form>;
}

function SectionIcon({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>;
}

type ServiceGroup = { id: string; name: string; items: Array<{ id: string; name: string }> };

export function ServicesForm({ groups, selected, selectedCategories, location }: {
  groups: ServiceGroup[];
  selected: string[];
  selectedCategories: string[];
  location: AddressValue & { baseCity: string; radiusKm: number };
}) {
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(selected);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(selectedCategories);
  const [address, setAddress] = useState<AddressValue>(location);
  const chosen = uniqueServices(groups.flatMap((group) => group.items)).filter((item) => selectedIds.includes(item.id));

  function toggle(itemId: string) {
    if (selectedIds.includes(itemId)) return setSelectedIds((items) => items.filter((id) => id !== itemId));
    if (selectedIds.length >= MAX_PROFILE_SERVICES) return setMessage(`Pasiekėte ${MAX_PROFILE_SERVICES} paslaugų limitą.`);
    const nextWorkAreas = new Set(selectedCategoryIds);
    if (!groups.some((group) => nextWorkAreas.has(group.id) && group.items.some((item) => item.id === itemId))) return;
    if (nextWorkAreas.size > MAX_PROFILE_CATEGORIES) return setMessage(`Pasiekėte ${MAX_PROFILE_CATEGORIES} darbo sričių limitą.`);
    setSelectedIds((items) => [...items, itemId]);
    setMessage("");
  }

  function toggleCategory(categoryId: string) {
    if (!selectedCategoryIds.includes(categoryId)) {
      if (selectedCategoryIds.length >= MAX_PROFILE_CATEGORIES) return setMessage(`Pasiekėte ${MAX_PROFILE_CATEGORIES} darbo sričių limitą.`);
      setSelectedCategoryIds((ids) => [...ids, categoryId]);
      setMessage("");
      return;
    }
    const remaining = selectedCategoryIds.filter((id) => id !== categoryId);
    const stillAvailable = new Set(groups.filter((group) => remaining.includes(group.id)).flatMap((group) => group.items.map((item) => item.id)));
    const removed = selectedIds.filter((id) => !stillAvailable.has(id));
    if (removed.length && !window.confirm(`Šioje darbo srityje pasirinktos ${removed.length} paslaugos. Pašalinus darbo sritį, šios paslaugos taip pat bus pašalintos.`)) return;
    setSelectedCategoryIds(remaining);
    setSelectedIds((ids) => ids.filter((id) => stillAvailable.has(id)));
    setMessage("");
  }

  async function submit(formData: FormData) {
    setMessage("Saugoma...");
    const [servicesResponse, areaResponse] = await Promise.all([
      fetch("/api/meistras/services", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ categoryIds: selectedCategoryIds, subcategoryIds: selectedIds }) }),
      fetch("/api/meistras/areas", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
        baseCity: formData.get("baseCity"), registeredAddress: address.address, googlePlaceId: address.placeId,
        latitude: address.latitude, longitude: address.longitude, radiusKm: formData.get("radiusKm")
      }) })
    ]);
    const failed = !servicesResponse.ok ? await servicesResponse.json() : !areaResponse.ok ? await areaResponse.json() : null;
    setMessage(failed ? failed.error ?? "Išsaugoti nepavyko." : "Paslaugos ir darbo zona išsaugotos.");
  }

  return <form className="portal-form services-editor" action={submit}>
    <section><h3>Darbo sritys ir paslaugos</h3>
      <label>Ieškoti paslaugos<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ieškoti paslaugos" /></label>
      <div className="selected-service-tags">{chosen.map((item) => <button type="button" key={item.id} onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== item.id))}>{item.name} ×</button>)}</div>
      <div className="portal-checks">{groups.map((group) => {
        const checked = selectedCategoryIds.includes(group.id);
        return <label key={group.id}><input type="checkbox" checked={checked} disabled={!checked && selectedCategoryIds.length >= MAX_PROFILE_CATEGORIES} onChange={() => toggleCategory(group.id)} />{group.name}</label>;
      })}</div>
      <div className="selection-counters" aria-live="polite">
        <strong>{selectionCounter("Darbo sritys", selectedCategoryIds.length, MAX_PROFILE_CATEGORIES)}</strong>
        <strong>{selectionCounter("Paslaugos", selectedIds.length, MAX_PROFILE_SERVICES)}</strong>
      </div>
      {selectedIds.length >= MAX_PROFILE_SERVICES ? <p role="status">Pasiekėte 25 paslaugų limitą.</p> : null}
      <div className="service-accordions">{groups.filter((group) => selectedCategoryIds.includes(group.id)).map((group) => {
        const visible = group.items.filter((item) => item.name.toLocaleLowerCase("lt").includes(query.toLocaleLowerCase("lt")));
        if (query && !visible.length) return null;
        return <details key={group.id} open={Boolean(query)}><summary>{group.name}<span>{group.items.filter((item) => selectedIds.includes(item.id)).length}</span></summary><div className="portal-checks">{visible.map((item) => { const checked = selectedIds.includes(item.id); return <label key={item.id}><input type="checkbox" checked={checked} disabled={!checked && selectedIds.length >= MAX_PROFILE_SERVICES} onChange={() => toggle(item.id)} />{item.name}</label>; })}</div></details>;
      })}</div>
    </section>
    <section><h3>Darbo vieta ir spindulys</h3>
      <label>Pagrindinis miestas<input name="baseCity" defaultValue={location.baseCity} required /></label>
      <AddressAutocomplete label="Privatus darbo bazės adresas" value={address} onChange={setAddress} required />
      <small>Tikslus adresas ir koordinatės yra privatūs. Klientai mato tik bendrą vietovę ir aptarnavimo zoną.</small>
      <label>Vienas paslaugų spindulys<select name="radiusKm" defaultValue={location.radiusKm}>{[5,10,20,25,30,50,75,100].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}<option value="150">Visa Lietuva</option></select></label>
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
