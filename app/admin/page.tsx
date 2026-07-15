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
  const [addDraft, setAddDraft] = useState<AddDraft>(emptyAddDraft);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addSucceeded, setAddSucceeded] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

  async function runAction(id: string, action: "approve" | "reject" | "suspend") {
    const label = action === "approve" ? "Tvirtinama" : action === "reject" ? "Atmetama" : "Stabdoma";
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
      setMessage(data.error ?? `${label} nepavyko.`);
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
  }

  async function saveProfile(id: string) {
    const draft = drafts[id];
    if (!draft) {
      return;
    }

    setMessage("Saugomi profilio pakeitimai...");
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
      return;
    }

    setMessage("Profilio pakeitimai išsaugoti.");
    await loadProfiles();
  }

  async function addTradesperson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
            <button type="submit">Pridėti specialistą</button>
          </form>
        </section>
      ) : null}

      <section className="admin-grid">
        {profiles.map((profile) => {
          const draft = drafts[profile.id] ?? profileToDraft(profile);

          return (
            <article className="admin-card" key={profile.id}>
              <div className="admin-card-header">
                <div>
                  <p className="eyebrow">{profile.status} / {profile.publicStatus}</p>
                  <h2>{profile.name}</h2>
                  <p>{profile.trade} / {formatSubcategories(profile)}</p>
                </div>
                <div className="admin-actions">
                  <button type="button" onClick={() => runAction(profile.id, "approve")}>
                    Tvirtinti
                  </button>
                  <button className="admin-danger" type="button" onClick={() => runAction(profile.id, "reject")}>
                    Atmesti
                  </button>
                  <button className="admin-danger" type="button" onClick={() => runAction(profile.id, "suspend")}>
                    Sustabdyti
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
              </dl>

              <p className="admin-description">{profile.description || "Aprašymo dar nėra."}</p>

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
                <button type="submit">Išsaugoti pakeitimus</button>
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

function selectedSubcategories(categories: Category[], categorySlugs: string[]) {
  return categories.filter((category) => categorySlugs.includes(category.slug)).flatMap((category) => category.subcategories);
}

function formatSubcategories(profile: Specialist, fallback = "Be subkategorijos") {
  return profile.subcategoryNames?.join(", ") || fallback;
}

function formatPublicStatus(profile: Specialist) {
  const status = profile.publicStatus ?? (profile.status === "approved" ? "public" : "private");
  return status === "private" ? "paslėpta" : status;
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
