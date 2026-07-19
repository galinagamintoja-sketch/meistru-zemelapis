"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { fetchLithuanianPlacesSuggestions, resolvePlacesSuggestionSelection, type PlacesSuggestion } from "../../components/LocalProApp";
import type { Category } from "../../lib/types";
import type { Specialist } from "../../lib/types";

type Upload = { name: string; type: "image/jpeg" | "image/png" | "image/webp"; size: number; dataUrl: string };

export default function JobRequestPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySlug, setCategorySlug] = useState("");
  const [subcategorySlug, setSubcategorySlug] = useState("");
  const [address, setAddress] = useState("");
  const [place, setPlace] = useState({ placeId: "", latitude: null as number | null, longitude: null as number | null, town: "" });
  const [suggestions, setSuggestions] = useState<PlacesSuggestion[]>([]);
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("flexible");
  const [preferredContactMethod, setPreferredContactMethod] = useState("phone");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [photoUploads, setPhotoUploads] = useState<Upload[]>([]);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [matches, setMatches] = useState<Array<{ specialist: Specialist; reason: string; distanceKm: number }>>([]);
  const [selectedMatches, setSelectedMatches] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/categories").then((response) => response.json()).then((data) => setCategories(data.categories ?? [])).catch(() => setMessage("Kategorijų įkelti nepavyko."));
  }, []);

  useEffect(() => {
    if (address.trim().length < 3 || place.placeId) return setSuggestions([]);
    const timer = window.setTimeout(() => {
      fetchLithuanianPlacesSuggestions(address).then(setSuggestions).catch(() => setSuggestions([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [address, place.placeId]);

  useEffect(() => {
    if (!requestId) return;
    fetch(`/api/job-requests/${requestId}/matches`).then((response) => response.json()).then((data) => setMatches((data.matches ?? []).filter((item: { specialist?: Specialist }) => Boolean(item.specialist)))).catch(() => setMatches([]));
  }, [requestId]);

  const category = categories.find((item) => item.slug === categorySlug);

  async function selectSuggestion(suggestion: PlacesSuggestion) {
    const selected = await resolvePlacesSuggestionSelection(suggestion);
    setAddress(selected.address);
    setPlace({ placeId: selected.placeId, latitude: selected.latitude, longitude: selected.longitude, town: selected.town });
    setSuggestions([]);
  }

  async function choosePhotos(files: FileList | null) {
    const selected = Array.from(files ?? []).slice(0, 4);
    const uploads = await Promise.all(selected.map((file) => new Promise<Upload>((resolve, reject) => {
      if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type) || file.size > 5 * 1024 * 1024) return reject(new Error());
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type as Upload["type"], size: file.size, dataUrl: String(reader.result) });
      reader.onerror = () => reject(new Error());
      reader.readAsDataURL(file);
    })));
    setPhotoUploads(uploads);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/job-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ categorySlug, subcategorySlug, address, ...place, description, urgency, preferredContactMethod, clientName, clientPhone, clientEmail, photoUploads, privacyConsent }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Užklausos išsaugoti nepavyko.");
      setRequestId(data.requestId);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (requestId) return <main className="job-request-shell"><section className="job-request-card confirmation-card"><p className="eyebrow">Užklausa gauta</p><h1>Ačiū — jūsų darbų užklausa išsaugota.</h1><p>Ji yra privati ir ją pirmiausia peržiūrės LocalPro administratorius.</p><p className="privacy-note">Užklausos numeris: {requestId}</p>
    <section className="match-results"><h2>Tinkami specialistai</h2>{matches.length ? <><p>Parinkta pagal paslaugą ir darbo zoną. Pasirinkimas žinučių automatiškai nesiunčia.</p>{matches.map(({ specialist, reason, distanceKm }) => <article className="match-card" key={specialist.id}>
      <label><input type="checkbox" checked={selectedMatches.includes(specialist.id)} onChange={(event) => setSelectedMatches((current) => event.target.checked ? [...current, specialist.id] : current.filter((id) => id !== specialist.id))} /><span><strong>{specialist.companyName || specialist.name}</strong><small>{specialist.trade} · apie {distanceKm} km · {reason === "matched_category_and_service" ? "atitinka paslaugą ir kategoriją" : "atitinka kategoriją"}</small></span></label>
      <div className="match-actions"><Link href={`/specialist/${specialist.id}`}>Profilis</Link><a href={`tel:${specialist.phone.replaceAll(" ", "")}`}>Skambinti</a><a href={`https://wa.me/${specialist.whatsapp.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a></div>
    </article>)}</> : <p>Šiuo metu tinkamų viešų specialistų nerasta.</p>}</section>
    <Link className="primary-action" href="/">Grįžti į LocalPro</Link></section></main>;

  return <main className="job-request-shell"><form className="job-request-card" onSubmit={submit}>
    <p className="eyebrow">Namų savininkams</p><h1>Aprašykite reikalingą darbą</h1><p>Užklausa ir nuotraukos nebus viešinamos.</p>
    <div className="job-request-grid">
      <label>Kategorija *<select required value={categorySlug} onChange={(event) => { setCategorySlug(event.target.value); setSubcategorySlug(""); }}><option value="">Pasirinkite</option>{categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
      <label>Paslauga<select value={subcategorySlug} onChange={(event) => setSubcategorySlug(event.target.value)}><option value="">Nebūtina</option>{category?.subcategories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
      <label className="job-request-wide">Darbo vieta *<input required value={address} onChange={(event) => { setAddress(event.target.value); setPlace({ placeId: "", latitude: null, longitude: null, town: "" }); }} placeholder="Pradėkite rašyti adresą" />{suggestions.length ? <ul className="address-suggestions">{suggestions.map((item) => <li key={item.id}><button type="button" onClick={() => selectSuggestion(item)}>{item.label}</button></li>)}</ul> : null}</label>
      <label className="job-request-wide">Trumpas aprašymas *<textarea required minLength={10} maxLength={1500} rows={6} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>Skubumas *<select value={urgency} onChange={(event) => setUrgency(event.target.value)}><option value="flexible">Lankstus terminas</option><option value="within_week">Per savaitę</option><option value="urgent">Skubu</option></select></label>
      <label>Pageidaujamas kontaktas *<select value={preferredContactMethod} onChange={(event) => setPreferredContactMethod(event.target.value)}><option value="phone">Telefonu</option><option value="whatsapp">WhatsApp</option><option value="email">El. paštu</option></select></label>
      <label>Vardas *<input required value={clientName} onChange={(event) => setClientName(event.target.value)} /></label>
      <label>Telefonas<input required={preferredContactMethod !== "email"} value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} /></label>
      <label>El. paštas<input type="email" required={preferredContactMethod === "email"} value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} /></label>
      <label>Nuotraukos (nebūtina)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => choosePhotos(event.target.files).catch(() => setMessage("Pasirinkite iki 4 JPG, PNG arba WebP nuotraukų, iki 5 MB."))} /><small>{photoUploads.length ? `Parinkta: ${photoUploads.length}` : "Iki 4 privačių nuotraukų"}</small></label>
      <label className="job-request-wide consent-row"><input type="checkbox" required checked={privacyConsent} onChange={(event) => setPrivacyConsent(event.target.checked)} /><span>Sutinku, kad LocalPro tvarkytų šiuos duomenis mano užklausai administruoti, ir susipažinau su <Link href="/privacy">privatumo politika</Link>.</span></label>
    </div>
    <button className="primary-action" disabled={submitting} type="submit">{submitting ? "Siunčiama..." : "Pateikti užklausą"}</button>{message ? <p className="status-message error">{message}</p> : null}
  </form></main>;
}
