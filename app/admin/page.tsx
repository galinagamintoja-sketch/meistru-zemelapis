"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Category, Specialist } from "../../lib/types";

type StatusFilter = "pending" | "approved" | "rejected" | "all";
type EditDraft = {
  name: string;
  companyName: string;
  phone: string;
  whatsapp: string;
  email: string;
  categorySlug: string;
  subcategories: string;
  town: string;
  operatingCities: string;
  radius: string;
  serviceArea: string;
  description: string;
};
type AddDraft = {
  name: string;
  phone: string;
  categorySlug: string;
  city: string;
  operatingCities: string;
  email: string;
  whatsapp: string;
  description: string;
  radius: string;
  source: string;
};

const tokenStorageKey = "localpro-admin-token";
const statuses: Array<{ value: StatusFilter; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" }
];
const profileSources = [
  { value: "admin-created", label: "Admin created" },
  { value: "self-registration", label: "Self registration" },
  { value: "imported-lead", label: "Imported lead" }
];
const emptyAddDraft: AddDraft = {
  name: "",
  phone: "",
  categorySlug: "",
  city: "",
  operatingCities: "",
  email: "",
  whatsapp: "",
  description: "",
  radius: "30",
  source: "admin-created"
};

export default function AdminPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [profiles, setProfiles] = useState<Specialist[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({});
  const [addDraft, setAddDraft] = useState<AddDraft>(emptyAddDraft);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addSucceeded, setAddSucceeded] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextToken = tokenInput.trim();
    if (!nextToken) {
      setMessage("Enter the admin token.");
      return;
    }

    await validateAndLoad(nextToken, "Admin token saved in this browser.");
  }

  function logout() {
    localStorage.removeItem(tokenStorageKey);
    setToken("");
    setTokenInput("");
    setProfiles([]);
    setDrafts({});
    setMessage("Logged out.");
  }

  async function validateAndLoad(nextToken: string, successMessage?: string) {
    setIsLoading(true);
    setMessage("Checking admin token...");

    try {
      const response = await fetch(`/api/admin/profiles?status=${status}`, { headers: authHeaders(nextToken) });
      const data = await response.json();

      if (!response.ok) {
        localStorage.removeItem(tokenStorageKey);
        setToken("");
        setProfiles([]);
        setDrafts({});
        setMessage(data.error ?? "Admin token rejected.");
        return;
      }

      const nextProfiles: Specialist[] = data.profiles ?? [];
      localStorage.setItem(tokenStorageKey, nextToken);
      setToken(nextToken);
      setTokenInput(nextToken);
      setProfiles(nextProfiles);
      setDrafts(Object.fromEntries(nextProfiles.map((profile) => [profile.id, profileToDraft(profile)])));
      setMessage(successMessage ?? profilesLoadedMessage(nextProfiles.length, data.mode));
    } catch {
      setMessage("Could not check admin token.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadProfiles(nextToken = token) {
    if (!nextToken) {
      return;
    }

    setIsLoading(true);
    setMessage("Loading profiles...");

    try {
      const response = await fetch(`/api/admin/profiles?status=${status}`, { headers: authHeaders(nextToken) });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem(tokenStorageKey);
          setToken("");
          setProfiles([]);
          setDrafts({});
        }
        setMessage(data.error ?? "Could not load profiles.");
        return;
      }

      const nextProfiles: Specialist[] = data.profiles ?? [];
      setProfiles(nextProfiles);
      setDrafts(Object.fromEntries(nextProfiles.map((profile) => [profile.id, profileToDraft(profile)])));
      setMessage(profilesLoadedMessage(nextProfiles.length, data.mode));
    } catch {
      setMessage("Could not load profiles.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCategories() {
    const response = await fetch("/api/categories");
    const data = await response.json();
    setCategories(data.categories ?? []);
  }

  async function runAction(id: string, action: "approve" | "reject") {
    const label = action === "approve" ? "Approve" : "Reject";
    setMessage(`${label} in progress...`);

    const response = await fetch("/api/admin/profiles", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeaders(token)
      },
      body: JSON.stringify({ id, action })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? `${label} failed.`);
      return;
    }

    setMessage(action === "approve" ? "Profile approved and made public." : "Profile rejected and hidden.");
    await loadProfiles();
  }

  async function saveProfile(id: string) {
    const draft = drafts[id];
    if (!draft) {
      return;
    }

    setMessage("Saving profile changes...");
    const response = await fetch("/api/admin/profiles", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeaders(token)
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
          categorySlug: draft.categorySlug,
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
      setMessage(data.error ?? "Save failed.");
      return;
    }

    setMessage("Profile changes saved.");
    await loadProfiles();
  }

  async function addTradesperson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Adding tradesperson...");
    setAddSucceeded(false);

    const response = await fetch("/api/admin/profiles", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(token)
      },
      body: JSON.stringify({
        name: addDraft.name,
        phone: addDraft.phone,
        categorySlug: addDraft.categorySlug,
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
      setMessage(data.error ?? "Could not add tradesperson.");
      return;
    }

    setAddSucceeded(true);
    setAddDraft(emptyAddDraft);
    setMessage("Tradesperson added successfully.");
    if (status === "pending") {
      await loadProfiles();
    } else {
      setStatus("pending");
    }
  }

  function updateDraft(id: string, field: keyof EditDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value
      }
    }));
  }

  function updateAddDraft(field: keyof AddDraft, value: string) {
    setAddDraft((current) => ({
      ...current,
      [field]: value
    }));
    setAddSucceeded(false);
  }

  useEffect(() => {
    const savedToken = localStorage.getItem(tokenStorageKey) ?? "";
    if (savedToken) {
      setTokenInput(savedToken);
      validateAndLoad(savedToken).catch(() => setMessage("Could not check saved admin token."));
    }

    loadCategories().catch(() => setMessage("Could not load categories."));
  }, []);

  useEffect(() => {
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, token]);

  if (!token) {
    return (
      <main className="admin-shell">
        <section className="admin-login">
          <p className="eyebrow">LocalPro admin</p>
          <h1>Admin login</h1>
          <p>Enter the existing admin token to review and publish tradesperson profiles.</p>
          <form onSubmit={login}>
            <label>
              Admin token
              <input
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="ADMIN_TOKEN"
                type="password"
                autoComplete="current-password"
              />
            </label>
            <button type="submit">Login</button>
          </form>
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
          <h1>Profile approval dashboard</h1>
          <p>Review registrations, edit profile details, then approve public listings or reject weak submissions.</p>
        </div>
        <button className="admin-secondary" type="button" onClick={logout}>
          Logout
        </button>
      </section>

      <div className="admin-toolbar">
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => loadProfiles()} disabled={isLoading}>
          {isLoading ? "Loading..." : "Refresh"}
        </button>
        <button type="button" onClick={() => setIsAddOpen((current) => !current)}>
          {isAddOpen ? "Close add form" : "Add tradesperson"}
        </button>
      </div>

      <p className="admin-message">{message}</p>

      {isAddOpen ? (
        <section className="admin-add-panel">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">Manual profile</p>
              <h2>Add tradesperson</h2>
              <p>New admin-created profiles stay pending and private until approved.</p>
            </div>
            {addSucceeded ? (
              <button className="admin-secondary" type="button" onClick={() => {
                setAddDraft(emptyAddDraft);
                setAddSucceeded(false);
              }}>
                Add another
              </button>
            ) : null}
          </div>

          <form className="admin-edit admin-add-form" onSubmit={addTradesperson}>
            <label>
              Name *
              <input required value={addDraft.name} onChange={(event) => updateAddDraft("name", event.target.value)} />
            </label>
            <label>
              Phone *
              <input required value={addDraft.phone} onChange={(event) => updateAddDraft("phone", event.target.value)} />
            </label>
            <label>
              Category *
              <select required value={addDraft.categorySlug} onChange={(event) => updateAddDraft("categorySlug", event.target.value)}>
                <option value="">Choose category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              City *
              <input required value={addDraft.city} onChange={(event) => updateAddDraft("city", event.target.value)} />
            </label>
            <label>
              Operating area *
              <input
                required
                placeholder="Vilnius, Lentvaris"
                value={addDraft.operatingCities}
                onChange={(event) => updateAddDraft("operatingCities", event.target.value)}
              />
            </label>
            <label>
              Radius km
              <input value={addDraft.radius} onChange={(event) => updateAddDraft("radius", event.target.value)} inputMode="numeric" />
            </label>
            <label>
              Email
              <input value={addDraft.email} onChange={(event) => updateAddDraft("email", event.target.value)} type="email" />
            </label>
            <label>
              WhatsApp
              <input value={addDraft.whatsapp} onChange={(event) => updateAddDraft("whatsapp", event.target.value)} />
            </label>
            <label>
              Source
              <select value={addDraft.source} onChange={(event) => updateAddDraft("source", event.target.value)}>
                {profileSources.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-wide">
              Description
              <textarea value={addDraft.description} onChange={(event) => updateAddDraft("description", event.target.value)} rows={4} />
            </label>
            <button type="submit">Add tradesperson</button>
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
                    Approve
                  </button>
                  <button className="admin-danger" type="button" onClick={() => runAction(profile.id, "reject")}>
                    Reject
                  </button>
                </div>
              </div>

              <dl className="admin-summary">
                <div><dt>Name</dt><dd>{profile.name}</dd></div>
                <div><dt>Business</dt><dd>{profile.companyName || "-"}</dd></div>
                <div><dt>Phone</dt><dd>{profile.phone}</dd></div>
                <div><dt>Email</dt><dd>{profile.email}</dd></div>
                <div><dt>Category</dt><dd>{profile.trade}</dd></div>
                <div><dt>Subcategory</dt><dd>{formatSubcategories(profile, "-")}</dd></div>
                <div><dt>City / area</dt><dd>{profile.town} / {profile.operatingCities.join(", ")}</dd></div>
                <div><dt>Verification</dt><dd>{profile.verificationLabel || "Pending"}</dd></div>
                <div><dt>Public status</dt><dd>{formatPublicStatus(profile)}</dd></div>
              </dl>

              <p className="admin-description">{profile.description || "No description yet."}</p>

              <form className="admin-edit" onSubmit={(event) => {
                event.preventDefault();
                saveProfile(profile.id);
              }}>
                <label>
                  Name
                  <input value={draft.name} onChange={(event) => updateDraft(profile.id, "name", event.target.value)} />
                </label>
                <label>
                  Business name
                  <input value={draft.companyName} onChange={(event) => updateDraft(profile.id, "companyName", event.target.value)} />
                </label>
                <label>
                  Phone
                  <input value={draft.phone} onChange={(event) => updateDraft(profile.id, "phone", event.target.value)} />
                </label>
                <label>
                  WhatsApp
                  <input value={draft.whatsapp} onChange={(event) => updateDraft(profile.id, "whatsapp", event.target.value)} />
                </label>
                <label>
                  Email
                  <input value={draft.email} onChange={(event) => updateDraft(profile.id, "email", event.target.value)} />
                </label>
                <label>
                  Category
                  <select value={draft.categorySlug} onChange={(event) => updateDraft(profile.id, "categorySlug", event.target.value)}>
                    <option value="">Choose category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Subcategory
                  <input value={draft.subcategories} onChange={(event) => updateDraft(profile.id, "subcategories", event.target.value)} disabled />
                </label>
                <label>
                  City
                  <input value={draft.town} onChange={(event) => updateDraft(profile.id, "town", event.target.value)} />
                </label>
                <label>
                  Operating cities
                  <input value={draft.operatingCities} onChange={(event) => updateDraft(profile.id, "operatingCities", event.target.value)} />
                </label>
                <label>
                  Radius km
                  <input value={draft.radius} onChange={(event) => updateDraft(profile.id, "radius", event.target.value)} inputMode="numeric" />
                </label>
                <label className="admin-wide">
                  Service area label
                  <input value={draft.serviceArea} onChange={(event) => updateDraft(profile.id, "serviceArea", event.target.value)} />
                </label>
                <label className="admin-wide">
                  Description
                  <textarea value={draft.description} onChange={(event) => updateDraft(profile.id, "description", event.target.value)} rows={4} />
                </label>
                <button type="submit">Save edits</button>
              </form>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function profileToDraft(profile: Specialist): EditDraft {
  return {
    name: profile.name,
    companyName: profile.companyName ?? "",
    phone: profile.phone,
    whatsapp: profile.whatsapp,
    email: profile.email,
    categorySlug: profile.categorySlug,
    subcategories: profile.subcategoryNames?.join(", ") ?? "",
    town: profile.town,
    operatingCities: profile.operatingCities.join(", "),
    radius: String(profile.radius),
    serviceArea: profile.serviceArea,
    description: profile.description
  };
}

function formatSubcategories(profile: Specialist, fallback = "No subcategory") {
  return profile.subcategoryNames?.join(", ") || fallback;
}

function formatPublicStatus(profile: Specialist) {
  const status = profile.publicStatus ?? (profile.status === "approved" ? "public" : "private");
  return status === "private" ? "hidden" : status;
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function authHeaders(token: string): Record<string, string> {
  return token ? { "x-admin-token": token } : {};
}

function profilesLoadedMessage(count: number, mode: string) {
  return mode === "seed" ? "Demo mode: Supabase is not connected." : `${count} profile(s) loaded.`;
}
