"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { Category, Specialist } from "../../lib/types";

type StatusFilter = "pending" | "approved" | "rejected" | "suspended" | "all";
type EditDraft = {
  name: string;
  companyName: string;
  phone: string;
  whatsapp: string;
  email: string;
  categorySlugs: string[];
  subcategorySlugs: string[];
  photoUrls: string[];
  town: string;
  operatingCities: string;
  radius: string;
  serviceArea: string;
  description: string;
};
type AddDraft = {
  name: string;
  phone: string;
  categorySlugs: string[];
  subcategorySlugs: string[];
  photoUrls: string[];
  city: string;
  operatingCities: string;
  email: string;
  whatsapp: string;
  description: string;
  radius: string;
  source: string;
};
type ConsentDraft = {
  channel: "website" | "whatsapp" | "telephone" | "written_form";
  consentText: string;
  capturedAt: string;
  evidenceReference: string;
};
type PreviewState = {
  profileId: string;
  specialist: Specialist;
};
type JobRequest = {
  id: string; client_name: string; client_phone?: string | null; client_email?: string | null;
  source_city: string; source_service: string; source_address: string; message: string;
  urgency: string; preferred_contact_method: string; privacy_consent_at: string; created_at: string;
  enquiry_photos?: Array<{ id: string; original_name?: string | null; preview_url?: string | null }>;
};

const statuses: Array<{ value: StatusFilter; label: string }> = [
  { value: "pending", label: "Laukiantys" },
  { value: "approved", label: "Patvirtinti" },
  { value: "rejected", label: "Atmesti" },
  { value: "suspended", label: "Sustabdyti" },
  { value: "all", label: "Visi" }
];
const profileSources = [
  { value: "admin-created", label: "Sukūrė administratorius" },
  { value: "self-registration", label: "Savarankiška registracija" },
  { value: "imported-lead", label: "Importuotas kontaktas" }
];
const emptyAddDraft: AddDraft = {
  name: "",
  phone: "",
  categorySlugs: [],
  subcategorySlugs: [],
  photoUrls: [""],
  city: "",
  operatingCities: "",
  email: "",
  whatsapp: "",
  description: "",
  radius: "30",
  source: "admin-created"
};

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [profiles, setProfiles] = useState<Specialist[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({});
  const [consentDrafts, setConsentDrafts] = useState<Record<string, ConsentDraft>>({});
  const [addDraft, setAddDraft] = useState<AddDraft>(emptyAddDraft);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addSucceeded, setAddSucceeded] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [jobRequests, setJobRequests] = useState<JobRequest[]>([]);
  const nextLoadMessageRef = useRef<string | null>(null);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setIsAdmin(false);
    setProfiles([]);
    setDrafts({});
    setMessage("Atsijungta.");
  }

  async function checkSession() {
    setIsLoading(true);
    setMessage("Tikrinama administratoriaus prieiga...");

    try {
      const response = await fetch("/api/auth/session");
      const data = await response.json();
      if (!data.isAdmin) {
        setIsAdmin(false);
        setMessage(data.user ? "Jūsų Google paskyra nėra administratorių sąraše." : "Prisijunkite su administratoriaus Google paskyra.");
        return;
      }

      setIsAdmin(true);
      setMessage("Administratoriaus prieiga patvirtinta.");
    } catch {
      setMessage("Nepavyko patikrinti administratoriaus prieigos.");
    } finally {
      setIsLoading(false);
      setSessionChecked(true);
    }
  }

  async function loadProfiles() {
    if (!isAdmin) {
      return;
    }

    setIsLoading(true);
    setMessage("Įkeliami profiliai...");

    try {
      const response = await fetch(`/api/admin/profiles?status=${status}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setIsAdmin(false);
          setProfiles([]);
          setDrafts({});
        }
        setMessage(data.error ?? "Nepavyko įkelti profilių.");
        return;
      }

      const nextProfiles: Specialist[] = data.profiles ?? [];
      setProfiles(nextProfiles);
      setDrafts(Object.fromEntries(nextProfiles.map((profile) => [profile.id, profileToDraft(profile)])));
      setConsentDrafts((current) => Object.fromEntries(nextProfiles.map((profile) => [profile.id, current[profile.id] ?? emptyConsentDraft()])));
      setNoteDrafts((current) => Object.fromEntries(nextProfiles.map((profile) => [profile.id, current[profile.id] ?? ""])));
      setMessage(nextLoadMessageRef.current ?? profilesLoadedMessage(nextProfiles.length, data.mode));
      nextLoadMessageRef.current = null;
    } catch {
      setMessage("Nepavyko įkelti profilių.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCategories() {
    const response = await fetch("/api/categories");
    const data = await response.json();
    setCategories(data.categories ?? []);
  }

  async function loadJobRequests() {
    if (!isAdmin) return;
    const response = await fetch("/api/admin/job-requests");
    const data = await response.json();
    if (response.ok) setJobRequests(data.requests ?? []);
  }

  async function runAction(id: string, action: "approve" | "reject" | "suspend" | "return_pending") {
    if ((action === "reject" || action === "suspend") && !confirm("Patvirtinkite: profilis bus paslėptas viešai.")) {
      return;
    }

    const label = action === "approve" ? "Tvirtinama" : action === "reject" ? "Atmetama" : action === "suspend" ? "Stabdoma" : "Grąžinama patikrai";
    setPendingActions((current) => ({ ...current, [`${id}:${action}`]: true }));
    setMessage(`${label}...`);

    const response = await fetch("/api/admin/profiles", {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ id, action })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage([data.error ?? `${label} nepavyko.`, ...(data.validationErrors ?? [])].join(" "));
      setPendingActions((current) => ({ ...current, [`${id}:${action}`]: false }));
      return;
    }

    setMessage(
      action === "approve"
        ? "Profilis patvirtintas ir publikuotas."
        : action === "reject"
          ? "Profilis atmestas ir paslėptas."
          : "Profilis sustabdytas ir paslėptas."
    );
    await loadProfiles();
    setPendingActions((current) => ({ ...current, [`${id}:${action}`]: false }));
  }

  async function moderatePhoto(profileId: string, photoId: string, moderationStatus: "approved" | "rejected") {
    if (moderationStatus === "rejected" && !confirm("Atmesta nuotrauka bus pašalinta iš viešo profilio.")) {
      return;
    }

    setPendingActions((current) => ({ ...current, [`${profileId}:photo:${photoId}`]: true }));
    setMessage(moderationStatus === "approved" ? "Nuotrauka tvirtinama..." : "Nuotrauka atmetama...");

    const response = await fetch("/api/admin/profiles", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: profileId, action: "moderate_photo", photoId, moderationStatus })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? "Nuotraukos busenos pakeisti nepavyko.");
      setPendingActions((current) => ({ ...current, [`${profileId}:photo:${photoId}`]: false }));
      return;
    }

    nextLoadMessageRef.current = moderationStatus === "approved" ? "Nuotrauka patvirtinta." : "Nuotrauka atmesta.";
    await loadProfiles();
    setPendingActions((current) => ({ ...current, [`${profileId}:photo:${photoId}`]: false }));
  }

  async function recordPublicContactConsent(profileId: string) {
    const draft = consentDrafts[profileId] ?? emptyConsentDraft();
    setPendingActions((current) => ({ ...current, [`${profileId}:consent`]: true }));
    setMessage("Irasomas viesu kontaktu sutikimas...");

    const response = await fetch("/api/admin/profiles", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: profileId,
        action: "record_public_contact_consent",
        consentChannel: draft.channel,
        consentText: draft.consentText,
        capturedAt: draft.capturedAt,
        evidenceReference: draft.evidenceReference
      })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? "Sutikimo irasyti nepavyko.");
      setPendingActions((current) => ({ ...current, [`${profileId}:consent`]: false }));
      return;
    }

    nextLoadMessageRef.current = "Viesu kontaktu sutikimas irasytas.";
    await loadProfiles();
    setPendingActions((current) => ({ ...current, [`${profileId}:consent`]: false }));
  }

  async function saveProfile(id: string) {
    const draft = drafts[id];
    if (!draft) {
      return;
    }

    setMessage("Saugomi profilio pakeitimai...");
    setPendingActions((current) => ({ ...current, [`${id}:save`]: true }));
    const response = await fetch("/api/admin/profiles", {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id,
        action: "update",
        profile: {
          name: draft.name,
          companyName: draft.companyName,
          phone: draft.phone,
          whatsapp: draft.whatsapp,
          email: draft.email,
          categorySlug: draft.categorySlugs[0] ?? "",
          categorySlugs: draft.categorySlugs,
          subcategorySlugs: draft.subcategorySlugs,
          photoUrls: draft.photoUrls.map((url) => url.trim()).filter(Boolean),
          town: draft.town,
          operatingCities: splitList(draft.operatingCities),
          radius: Number(draft.radius),
          serviceArea: draft.serviceArea,
          description: draft.description
        }
      })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? "Išsaugoti nepavyko.");
      setPendingActions((current) => ({ ...current, [`${id}:save`]: false }));
      return;
    }

    setMessage("Profilio pakeitimai išsaugoti.");
    await loadProfiles();
    setPendingActions((current) => ({ ...current, [`${id}:save`]: false }));
  }

  async function addTradesperson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingActions((current) => ({ ...current, add: true }));
    setMessage("Pridedamas specialistas...");
    setAddSucceeded(false);

    const response = await fetch("/api/admin/profiles", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: addDraft.name,
        phone: addDraft.phone,
        categorySlug: addDraft.categorySlugs[0] ?? "",
        categorySlugs: addDraft.categorySlugs,
        subcategorySlugs: addDraft.subcategorySlugs,
        photoUrls: addDraft.photoUrls.map((url) => url.trim()).filter(Boolean),
        city: addDraft.city,
        operatingCities: splitList(addDraft.operatingCities || addDraft.city),
        email: addDraft.email,
        whatsapp: addDraft.whatsapp,
        description: addDraft.description,
        radius: Number(addDraft.radius),
        source: addDraft.source
      })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? "Specialisto pridėti nepavyko.");
      setPendingActions((current) => ({ ...current, add: false }));
      return;
    }

    setAddSucceeded(true);
    setAddDraft(emptyAddDraft);
    nextLoadMessageRef.current = "Specialistas pridėtas.";
    if (status === "pending") {
      await loadProfiles();
    } else {
      setStatus("pending");
    }
    setPendingActions((current) => ({ ...current, add: false }));
  }

  async function previewPublicProfile(profileId: string) {
    setPendingActions((current) => ({ ...current, [`${profileId}:preview`]: true }));
    setMessage("Ruošiama viešo profilio peržiūra...");

    const response = await fetch(`/api/admin/profiles?preview=${encodeURIComponent(profileId)}`);
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? "Peržiūros paruošti nepavyko.");
      setPendingActions((current) => ({ ...current, [`${profileId}:preview`]: false }));
      return;
    }

    setPreview({ profileId, specialist: data.specialist });
    setMessage("Viešo profilio peržiūra paruošta.");
    setPendingActions((current) => ({ ...current, [`${profileId}:preview`]: false }));
  }

  async function addAdminNote(profileId: string) {
    const notes = noteDrafts[profileId]?.trim() ?? "";
    setPendingActions((current) => ({ ...current, [`${profileId}:note`]: true }));
    setMessage("Įrašoma administratoriaus pastaba...");

    const response = await fetch("/api/admin/profiles", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: profileId, action: "admin_note", notes })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? "Pastabos įrašyti nepavyko.");
      setPendingActions((current) => ({ ...current, [`${profileId}:note`]: false }));
      return;
    }

    setNoteDrafts((current) => ({ ...current, [profileId]: "" }));
    nextLoadMessageRef.current = "Administratoriaus pastaba įrašyta.";
    await loadProfiles();
    setPendingActions((current) => ({ ...current, [`${profileId}:note`]: false }));
  }

  function updateDraft(id: string, field: keyof EditDraft, value: string | string[]) {
    setDrafts((current) => {
      const draft = current[id];
      if (!draft) {
        return current;
      }

      const nextDraft: EditDraft = {
        ...draft,
        [field]: value
      } as EditDraft;

      if (field === "categorySlugs" && Array.isArray(value)) {
        const allowedSubcategories = new Set(selectedSubcategories(categories, value).map((subcategory) => subcategory.slug));
        nextDraft.subcategorySlugs = draft.subcategorySlugs.filter((slug) => allowedSubcategories.has(slug));
      }

      return {
        ...current,
        [id]: nextDraft
      };
    });
  }

  function updateAddDraft(field: keyof AddDraft, value: string | string[]) {
    setAddDraft((current) => {
      const nextDraft: AddDraft = {
        ...current,
        [field]: value
      } as AddDraft;

      if (field === "categorySlugs" && Array.isArray(value)) {
        const allowedSubcategories = new Set(selectedSubcategories(categories, value).map((subcategory) => subcategory.slug));
        nextDraft.subcategorySlugs = current.subcategorySlugs.filter((slug) => allowedSubcategories.has(slug));
      }

      return nextDraft;
    });
    setAddSucceeded(false);
  }

  function updateConsentDraft(id: string, field: keyof ConsentDraft, value: string) {
    setConsentDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? emptyConsentDraft()),
        [field]: value
      }
    }));
  }

  function updateDraftPhotoUrl(id: string, index: number, value: string) {
    setDrafts((current) => {
      const draft = current[id];
      if (!draft) {
        return current;
      }

      const photoUrls = [...draft.photoUrls];
      photoUrls[index] = value;
      return { ...current, [id]: { ...draft, photoUrls } };
    });
  }

  function updateAddPhotoUrl(index: number, value: string) {
    setAddDraft((current) => {
      const photoUrls = [...current.photoUrls];
      photoUrls[index] = value;
      return { ...current, photoUrls };
    });
    setAddSucceeded(false);
  }

  function addDraftPhotoField(id: string) {
    setDrafts((current) => {
      const draft = current[id];
      if (!draft || draft.photoUrls.length >= 8) {
        return current;
      }

      return { ...current, [id]: { ...draft, photoUrls: [...draft.photoUrls, ""] } };
    });
  }

  function removeDraftPhotoField(id: string, index: number) {
    setDrafts((current) => {
      const draft = current[id];
      if (!draft) {
        return current;
      }

      const next = draft.photoUrls.length > 1 ? draft.photoUrls.filter((_, currentIndex) => currentIndex !== index) : [""];
      return { ...current, [id]: { ...draft, photoUrls: next } };
    });
  }

  function addAddPhotoField() {
    setAddDraft((current) => ({
      ...current,
      photoUrls: current.photoUrls.length >= 8 ? current.photoUrls : [...current.photoUrls, ""]
    }));
    setAddSucceeded(false);
  }

  function removeAddPhotoField(index: number) {
    setAddDraft((current) => ({
      ...current,
      photoUrls: current.photoUrls.length > 1 ? current.photoUrls.filter((_, currentIndex) => currentIndex !== index) : [""]
    }));
    setAddSucceeded(false);
  }

  useEffect(() => {
    checkSession().catch(() => setMessage("Nepavyko patikrinti administratoriaus prieigos."));
    loadCategories().catch(() => setMessage("Nepavyko įkelti kategorijų."));
  }, []);

  useEffect(() => {
    loadProfiles();
    loadJobRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isAdmin]);

  const addAvailableSubcategories = selectedSubcategories(categories, addDraft.categorySlugs);

  if (!sessionChecked || !isAdmin) {
    return (
      <main className="admin-shell">
        <section className="admin-login">
          <p className="eyebrow">LocalPro admin</p>
          <h1>Administratoriaus prisijungimas</h1>
          <p>Prisijunkite su Google paskyra, kuri yra administratorių sąraše.</p>
          <a className="primary-action" href="/login">Prisijungti su Google</a>
          <p className="admin-message">{message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <section className="section-heading admin-heading">
        <div>
          <p className="eyebrow">LocalPro admin</p>
          <h1>Profilių patikros skydelis</h1>
          <p>Peržiūrėkite registracijas, pataisykite duomenis ir patvirtinkite arba atmeskite profilius.</p>
        </div>
        <button className="admin-secondary" type="button" onClick={logout}>
          Atsijungti
        </button>
      </section>

      <div className="admin-toolbar">
        <label>
          Būsena
          <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => loadProfiles()} disabled={isLoading}>
          {isLoading ? "Kraunama..." : "Atnaujinti"}
        </button>
        <button type="button" onClick={() => setIsAddOpen((current) => !current)}>
          {isAddOpen ? "Uždaryti pridėjimo formą" : "Pridėti specialistą"}
        </button>
      </div>

      <p className="admin-message">{message}</p>

      <section className="admin-add-panel">
        <div className="admin-card-header"><div><p className="eyebrow">Namų savininkų užklausos</p><h2>Privačios darbų užklausos</h2><p>Matomos tik prisijungusiam administratoriui.</p></div><button className="admin-secondary" type="button" onClick={loadJobRequests}>Atnaujinti</button></div>
        <div className="admin-grid">{jobRequests.length ? jobRequests.map((item) => <article className="admin-card" key={item.id}>
          <div className="admin-card-header"><div><p className="eyebrow">{item.urgency} / {formatDateTime(item.created_at)}</p><h2>{item.client_name}</h2><p>{item.source_service} · {item.source_city}</p></div></div>
          <dl className="admin-summary"><div><dt>Adresas</dt><dd>{item.source_address}</dd></div><div><dt>Kontaktas</dt><dd>{item.preferred_contact_method}: {item.client_phone || item.client_email}</dd></div><div><dt>Nuotraukos</dt><dd>{item.enquiry_photos?.length ?? 0}</dd></div></dl>
          <p className="admin-description">{item.message}</p>
          {item.enquiry_photos?.length ? <div className="admin-meta">{item.enquiry_photos.map((photo) => photo.preview_url ? <a key={photo.id} href={photo.preview_url} target="_blank" rel="noreferrer">{photo.original_name || "Peržiūrėti nuotrauką"}</a> : <span key={photo.id}>Nuotraukos peržiūra nepasiekiama</span>)}</div> : null}
        </article>) : <p>Naujų darbų užklausų nėra.</p>}</div>
      </section>

      {isAddOpen ? (
        <section className="admin-add-panel">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">Rankinis profilis</p>
              <h2>Pridėti specialistą</h2>
              <p>Naujai administratoriaus sukurti profiliai lieka laukiantys ir privatūs, kol juos patvirtinsite.</p>
            </div>
            {addSucceeded ? (
              <button className="admin-secondary" type="button" onClick={() => {
                setAddDraft(emptyAddDraft);
                setAddSucceeded(false);
              }}>
                Pridėti dar vieną
              </button>
            ) : null}
          </div>

          <form className="admin-edit admin-add-form" onSubmit={addTradesperson}>
            <label>
              Vardas *
              <input required value={addDraft.name} onChange={(event) => updateAddDraft("name", event.target.value)} />
            </label>
            <label>
              Telefonas *
              <input required value={addDraft.phone} onChange={(event) => updateAddDraft("phone", event.target.value)} />
            </label>
            <label>
              Kategorijos *
              <select
                multiple
                size={Math.min(6, Math.max(3, categories.length))}
                required
                value={addDraft.categorySlugs}
                onChange={(event) =>
                  updateAddDraft(
                    "categorySlugs",
                    Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                  )
                }
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subkategorijos
              <select
                multiple
                size={Math.min(8, Math.max(3, addAvailableSubcategories.length || 3))}
                value={addDraft.subcategorySlugs}
                onChange={(event) =>
                  updateAddDraft(
                    "subcategorySlugs",
                    Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                  )
                }
                disabled={!addAvailableSubcategories.length}
              >
                {addAvailableSubcategories.map((subcategory) => (
                  <option key={subcategory.id} value={subcategory.slug}>
                    {subcategory.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Miestas *
              <input required value={addDraft.city} onChange={(event) => updateAddDraft("city", event.target.value)} />
            </label>
            <label>
              Aptarnavimo zona *
              <input
                required
                placeholder="Vilnius, Lentvaris"
                value={addDraft.operatingCities}
                onChange={(event) => updateAddDraft("operatingCities", event.target.value)}
              />
            </label>
            <label>
              Spindulys km
              <input value={addDraft.radius} onChange={(event) => updateAddDraft("radius", event.target.value)} inputMode="numeric" />
            </label>
            <label>
              El. paštas
              <input value={addDraft.email} onChange={(event) => updateAddDraft("email", event.target.value)} type="email" />
            </label>
            <label>
              WhatsApp
              <input value={addDraft.whatsapp} onChange={(event) => updateAddDraft("whatsapp", event.target.value)} />
            </label>
            <label>
              Šaltinis
              <select value={addDraft.source} onChange={(event) => updateAddDraft("source", event.target.value)}>
                {profileSources.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-wide">
              Aprašymas
              <textarea value={addDraft.description} onChange={(event) => updateAddDraft("description", event.target.value)} rows={4} />
            </label>
            <fieldset className="admin-wide">
              <legend>Nuotraukų URL</legend>
              <p className="field-note">JPG, PNG arba WebP, iki 8 nuotraukų, iki 5 MB kiekviena. Naudokite viešus URL.</p>
              {addDraft.photoUrls.map((photoUrl, index) => (
                <div className="form-row" key={`add-photo-${index}`}>
                  <label>
                    Nuotraukos URL {index + 1}
                    <input
                      type="url"
                      placeholder="https://..."
                      value={photoUrl}
                      onChange={(event) => updateAddPhotoUrl(index, event.target.value)}
                    />
                  </label>
                  <button type="button" className="admin-secondary" onClick={() => removeAddPhotoField(index)}>
                    Pašalinti
                  </button>
                </div>
              ))}
              <button type="button" className="admin-secondary" onClick={addAddPhotoField} disabled={addDraft.photoUrls.length >= 8}>
                Pridėti URL
              </button>
            </fieldset>
            <button type="submit" disabled={pendingActions.add}>Pridėti specialistą</button>
          </form>
        </section>
      ) : null}

      <section className="admin-grid">
        {profiles.map((profile) => {
          const draft = drafts[profile.id] ?? profileToDraft(profile);
          const eligibility = publicationEligibility(profile);
          const canApprove = eligibility.filter((item) => !item.isState).every((item) => item.ok) && profile.status !== "approved";
          const approvedPhotos = profile.photoRecords?.filter((photo) => photo.moderationStatus === "approved" && !photo.removedAt) ?? [];

          return (
            <article className="admin-card" key={profile.id}>
              <div className="admin-card-header">
                <div>
                  <p className="eyebrow">{formatApprovalStatus(profile.status)} / {formatPublicStatus(profile)}</p>
                  <h2>{profile.name}</h2>
                  <p>{profile.trade} / {formatSubcategories(profile)}</p>
                </div>
                <div className="admin-actions">
                  <button type="button" onClick={() => runAction(profile.id, "approve")} disabled={!canApprove || pendingActions[`${profile.id}:approve`]}>
                    Tvirtinti
                  </button>
                  <button className="admin-danger" type="button" onClick={() => runAction(profile.id, "reject")} disabled={profile.status === "rejected" || pendingActions[`${profile.id}:reject`]}>
                    Atmesti
                  </button>
                  <button className="admin-danger" type="button" onClick={() => runAction(profile.id, "suspend")} disabled={profile.status === "suspended" || pendingActions[`${profile.id}:suspend`]}>
                    Sustabdyti
                  </button>
                  <button type="button" onClick={() => runAction(profile.id, "return_pending")} disabled={profile.status === "pending" || pendingActions[`${profile.id}:return_pending`]}>
                    Grąžinti patikrai
                  </button>
                  <button type="button" className="admin-secondary" onClick={() => previewPublicProfile(profile.id)} disabled={pendingActions[`${profile.id}:preview`]}>
                    Vieša peržiūra
                  </button>
                </div>
              </div>

              <dl className="admin-summary">
                <div><dt>Vardas</dt><dd>{profile.name}</dd></div>
                <div><dt>Įmonė</dt><dd>{profile.companyName || "-"}</dd></div>
                <div><dt>Telefonas</dt><dd>{profile.phone}</dd></div>
                <div><dt>El. paštas</dt><dd>{profile.email}</dd></div>
                <div><dt>Kategorija</dt><dd>{profile.trade}</dd></div>
                <div><dt>Subkategorija</dt><dd>{formatSubcategories(profile, "-")}</dd></div>
                <div><dt>Miestas / zona</dt><dd>{profile.town} / {profile.operatingCities.join(", ")}</dd></div>
                <div><dt>Patikra</dt><dd>{profile.verificationLabel || "Laukiama"}</dd></div>
                <div><dt>Vieša būsena</dt><dd>{formatPublicStatus(profile)}</dd></div>
                <div><dt>Viešų kontaktų sutikimas</dt><dd>{profile.publicContactConsentAt ? formatDateTime(profile.publicContactConsentAt) : "Nėra"}</dd></div>
              </dl>

              <p className="admin-description">{profile.description || "Aprašymo dar nėra."}</p>

              <section className="admin-eligibility" aria-label="Publication eligibility">
                <div>
                  <strong>Publikavimo parengtis</strong>
                  <span>{eligibility.every((item) => item.ok) ? "Profilis turi pagrindinius publikavimo duomenis." : "Pries publikavima perziurekite pazymetus punktus."}</span>
                </div>
                <ul>
                  {eligibility.map((item) => (
                    <li key={item.label} data-ok={item.ok ? "true" : "false"}>
                      <span aria-hidden="true">{item.ok ? "OK" : "!"}</span>
                      {item.label}
                    </li>
                  ))}
                </ul>
              </section>

              {preview?.profileId === profile.id ? (
                <section className="admin-preview" aria-label="Viešo profilio peržiūra">
                  <div>
                    <strong>Vieša peržiūra</strong>
                    <span>Naudojamas viešas duomenų formatas, be tikslaus adreso, vidinių pastabų ar sutikimų žurnalų.</span>
                  </div>
                  <dl className="admin-summary">
                    <div><dt>Vardas</dt><dd>{preview.specialist.name}</dd></div>
                    <div><dt>Kontaktas</dt><dd>{preview.specialist.phone}</dd></div>
                    <div><dt>Vieta</dt><dd>{preview.specialist.approximateLocation}</dd></div>
                    <div><dt>Paslaugos</dt><dd>{formatSubcategories(preview.specialist, "-")}</dd></div>
                    <div><dt>Nuotraukos</dt><dd>{preview.specialist.photoUrls?.length ?? 0}</dd></div>
                    <div><dt>Koordinatės</dt><dd>Apytikslės</dd></div>
                  </dl>
                </section>
              ) : null}

              <section className="admin-consent-panel">
                <p className="field-note">
                  Record this only after the specialist explicitly agreed that selected contact details may be displayed publicly.
                </p>
                <div className="admin-edit">
                  <label>
                    Sutikimo kanalas
                    <select
                      value={(consentDrafts[profile.id] ?? emptyConsentDraft()).channel}
                      onChange={(event) => updateConsentDraft(profile.id, "channel", event.target.value)}
                    >
                      <option value="website">Website</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="telephone">Telephone</option>
                      <option value="written_form">Written form</option>
                    </select>
                  </label>
                  <label>
                    Užfiksuota
                    <input
                      type="datetime-local"
                      value={(consentDrafts[profile.id] ?? emptyConsentDraft()).capturedAt}
                      onChange={(event) => updateConsentDraft(profile.id, "capturedAt", event.target.value)}
                    />
                  </label>
                  <label className="admin-wide">
                    Sutikimo tekstas arba nuoroda į tekstą
                    <textarea
                      rows={3}
                      value={(consentDrafts[profile.id] ?? emptyConsentDraft()).consentText}
                      onChange={(event) => updateConsentDraft(profile.id, "consentText", event.target.value)}
                    />
                  </label>
                  <label className="admin-wide">
                    Įrodymo / pokalbio nuoroda
                    <input
                      value={(consentDrafts[profile.id] ?? emptyConsentDraft()).evidenceReference}
                      onChange={(event) => updateConsentDraft(profile.id, "evidenceReference", event.target.value)}
                    />
                  </label>
                  <button type="button" className="admin-secondary" onClick={() => recordPublicContactConsent(profile.id)}>
                    Įrašyti viešų kontaktų sutikimą
                  </button>
                </div>
              </section>

              <section className="admin-history" aria-label="Vidinės pastabos ir auditas">
                <div className="admin-card-header">
                  <div>
                    <strong>Vidinės pastabos ir auditas</strong>
                    <p>Pastabos lieka tik administratoriaus skydelyje ir nėra grąžinamos viešai.</p>
                  </div>
                </div>
                <div className="admin-edit">
                  <label className="admin-wide">
                    Administratoriaus pastaba
                    <textarea
                      rows={3}
                      value={noteDrafts[profile.id] ?? ""}
                      onChange={(event) => setNoteDrafts((current) => ({ ...current, [profile.id]: event.target.value }))}
                    />
                  </label>
                  <button type="button" className="admin-secondary" onClick={() => addAdminNote(profile.id)} disabled={pendingActions[`${profile.id}:note`]}>
                    Įrašyti pastabą
                  </button>
                </div>
                {profile.adminActions?.length ? (
                  <ul className="admin-audit-list">
                    {profile.adminActions.slice(0, 8).map((action) => (
                      <li key={action.id}>
                        <span>{formatDateTime(action.createdAt)}</span>
                        <strong>{formatActionType(action.action)}</strong>
                        {action.notes ? <em>{action.notes}</em> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="field-note">Audito veiksmų dar nėra.</p>
                )}
              </section>

              <form className="admin-edit" onSubmit={(event) => {
                event.preventDefault();
                saveProfile(profile.id);
              }}>
                <label>
                  Vardas
                  <input value={draft.name} onChange={(event) => updateDraft(profile.id, "name", event.target.value)} />
                </label>
                <label>
                  Įmonės pavadinimas
                  <input value={draft.companyName} onChange={(event) => updateDraft(profile.id, "companyName", event.target.value)} />
                </label>
                <label>
                  Telefonas
                  <input value={draft.phone} onChange={(event) => updateDraft(profile.id, "phone", event.target.value)} />
                </label>
                <label>
                  WhatsApp
                  <input value={draft.whatsapp} onChange={(event) => updateDraft(profile.id, "whatsapp", event.target.value)} />
                </label>
                <label>
                  El. paštas
                  <input value={draft.email} onChange={(event) => updateDraft(profile.id, "email", event.target.value)} />
                </label>
                <label>
                  Kategorijos
                  <select
                    multiple
                    size={Math.min(6, Math.max(3, categories.length))}
                    value={draft.categorySlugs}
                    onChange={(event) =>
                      updateDraft(
                        profile.id,
                        "categorySlugs",
                        Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                      )
                    }
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Subkategorijos
                  <select
                    multiple
                    size={Math.min(8, Math.max(3, selectedSubcategories(categories, draft.categorySlugs).length || 3))}
                    value={draft.subcategorySlugs}
                    onChange={(event) =>
                      updateDraft(
                        profile.id,
                        "subcategorySlugs",
                        Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                      )
                    }
                    disabled={!selectedSubcategories(categories, draft.categorySlugs).length}
                  >
                    {selectedSubcategories(categories, draft.categorySlugs).map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.slug}>
                        {subcategory.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Miestas
                  <input value={draft.town} onChange={(event) => updateDraft(profile.id, "town", event.target.value)} />
                </label>
                <label>
                  Aptarnaujami miestai
                  <input value={draft.operatingCities} onChange={(event) => updateDraft(profile.id, "operatingCities", event.target.value)} />
                </label>
                <label>
                  Spindulys km
                  <input value={draft.radius} onChange={(event) => updateDraft(profile.id, "radius", event.target.value)} inputMode="numeric" />
                </label>
                <label className="admin-wide">
                  Aptarnavimo zonos pavadinimas
                  <input value={draft.serviceArea} onChange={(event) => updateDraft(profile.id, "serviceArea", event.target.value)} />
                </label>
                <label className="admin-wide">
                  Aprašymas
                  <textarea value={draft.description} onChange={(event) => updateDraft(profile.id, "description", event.target.value)} rows={4} />
                </label>
                <fieldset className="admin-wide">
                  <legend>Nuotraukų URL</legend>
                  <p className="field-note">JPG, PNG arba WebP, iki 8 nuotraukų, iki 5 MB kiekviena. Naudokite viešus URL.</p>
                  <p className="field-note">
                    {approvedPhotos.length ? `Pagrindinė vieša nuotrauka: ${approvedPhotos[0].label || approvedPhotos[0].url}` : "Patvirtintų viešų nuotraukų dar nėra."}
                  </p>
                  {profile.photoRecords?.length ? (
                    <div className="admin-photo-moderation">
                      {profile.photoRecords.map((photo) => (
                        <div className="admin-photo-row" key={photo.id}>
                          <span>{photo.label || photo.url}</span>
                          <span>{formatPhotoStatus(photo)}{approvedPhotos[0]?.id === photo.id ? " / pagrindinė" : ""}</span>
                          <button type="button" className="admin-secondary" onClick={() => moderatePhoto(profile.id, photo.id, "approved")} disabled={(photo.moderationStatus === "approved" && !photo.removedAt) || pendingActions[`${profile.id}:photo:${photo.id}`]}>
                            Patvirtinti nuotrauka
                          </button>
                          <button type="button" className="admin-danger" onClick={() => moderatePhoto(profile.id, photo.id, "rejected")} disabled={photo.moderationStatus === "rejected" || pendingActions[`${profile.id}:photo:${photo.id}`]}>
                            Atmesti nuotrauka
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="field-note">Nuotraukų nėra. Profilis gali būti tvarkomas, bet viešai bus rodomas be darbų nuotraukų.</p>
                  )}
                  {draft.photoUrls.map((photoUrl, index) => (
                    <div className="form-row" key={`photo-${profile.id}-${index}`}>
                      <label>
                        Nuotraukos URL {index + 1}
                        <input
                          type="url"
                          placeholder="https://..."
                          value={photoUrl}
                          onChange={(event) => updateDraftPhotoUrl(profile.id, index, event.target.value)}
                        />
                      </label>
                      <button type="button" className="admin-secondary" onClick={() => removeDraftPhotoField(profile.id, index)}>
                        Pašalinti
                      </button>
                    </div>
                  ))}
                  <button type="button" className="admin-secondary" onClick={() => addDraftPhotoField(profile.id)} disabled={draft.photoUrls.length >= 8}>
                    Pridėti URL
                  </button>
                </fieldset>
                <button type="submit" disabled={pendingActions[`${profile.id}:save`]}>Išsaugoti pakeitimus</button>
              </form>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function profileToDraft(profile: Specialist): EditDraft {
  const categorySlugs = profile.categorySlugs?.length ? profile.categorySlugs : profile.categorySlug ? [profile.categorySlug] : [];
  return {
    name: profile.name,
    companyName: profile.companyName ?? "",
    phone: profile.phone,
    whatsapp: profile.whatsapp,
    email: profile.email,
    categorySlugs,
    subcategorySlugs: profile.subcategorySlugs ?? [],
    photoUrls: profile.photoUrls?.length ? profile.photoUrls : [""],
    town: profile.town,
    operatingCities: profile.operatingCities.join(", "),
    radius: String(profile.radius),
    serviceArea: profile.serviceArea,
    description: profile.description
  };
}

function emptyConsentDraft(): ConsentDraft {
  return {
    channel: "whatsapp",
    consentText: "",
    capturedAt: toDateTimeLocalValue(new Date()),
    evidenceReference: ""
  };
}

function toDateTimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("lt-LT");
}

function selectedSubcategories(categories: Category[], categorySlugs: string[]) {
  return categories.filter((category) => categorySlugs.includes(category.slug)).flatMap((category) => category.subcategories);
}

function formatSubcategories(profile: Specialist, fallback = "Be subkategorijos") {
  return profile.subcategoryNames?.join(", ") || fallback;
}

function formatPublicStatus(profile: Specialist) {
  const status = profile.publicStatus ?? (profile.status === "approved" ? "public" : "private");
  return status === "private" ? "privatus" : "viešas";
}

function formatApprovalStatus(status: Specialist["status"]) {
  return status === "approved"
    ? "patvirtintas"
    : status === "suspended"
      ? "sustabdytas"
      : status === "rejected"
        ? "atmestas"
        : "laukiantis";
}

function formatPhotoStatus(photo: NonNullable<Specialist["photoRecords"]>[number]) {
  if (photo.removedAt) {
    return "pašalinta";
  }

  return photo.moderationStatus === "approved"
    ? "patvirtinta"
    : photo.moderationStatus === "rejected"
      ? "atmesta"
      : "laukiama";
}

function formatActionType(action: string) {
  const labels: Record<string, string> = {
    approve: "Patvirtinta",
    reject: "Atmesta",
    suspend: "Sustabdyta",
    return_pending: "Grąžinta patikrai",
    update: "Atnaujinta",
    moderate_photo: "Nuotraukos moderavimas",
    record_public_contact_consent: "Viešų kontaktų sutikimas",
    admin_note: "Vidinė pastaba",
    profile_admin_created: "Sukurta administratoriaus",
    profile_submitted: "Registracija pateikta"
  };
  return labels[action] ?? action;
}

function publicationEligibility(profile: Specialist) {
  const photoRecords = profile.photoRecords ?? [];
  const hasPhotoRecords = photoRecords.length > 0;
  const approvedVisiblePhotos = photoRecords.filter((photo) => photo.moderationStatus === "approved" && !photo.removedAt).length;
  const hasUnmoderatedVisiblePhotos = photoRecords.some((photo) => !photo.removedAt && photo.moderationStatus !== "approved");
  const hasContactDetails = Boolean(profile.phone || profile.email || profile.whatsapp);
  const hasServices = (profile.subcategorySlugs?.length ?? 0) >= 3 || (profile.subcategoryNames?.length ?? 0) >= 3;

  return [
    { label: "Patvirtinimo būsena: patvirtintas", ok: profile.status === "approved", isState: true },
    { label: "Viešumo būsena: viešas", ok: formatPublicStatus(profile) === "viešas", isState: true },
    { label: "Yra viešų kontaktų sutikimas", ok: Boolean(profile.publicContactConsentAt) },
    { label: hasServices ? "Yra bent 3 konkrečios paslaugos" : "Trūksta bent 3 konkrečių paslaugų", ok: hasServices },
    { label: "Yra aptarnavimo miestas ir spindulys", ok: profile.operatingCities.length > 0 && profile.radius > 0 },
    { label: "Yra viešas telefono, el. pašto arba WhatsApp kontaktas", ok: hasContactDetails },
    { label: hasPhotoRecords ? "Visos rodomos nuotraukos moderuotos" : "Nuotraukų nėra, viešas profilis naudos tuščią būseną", ok: !hasUnmoderatedVisiblePhotos },
    { label: approvedVisiblePhotos ? "Yra patvirtinta pagrindinė nuotrauka" : "Patvirtintų nuotraukų nėra", ok: !hasPhotoRecords || approvedVisiblePhotos > 0 }
  ];
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function profilesLoadedMessage(count: number, mode: string) {
  return mode === "seed" ? "Vietinis demo režimas: Supabase neprijungtas." : `Įkelta profilių: ${count}.`;
}
