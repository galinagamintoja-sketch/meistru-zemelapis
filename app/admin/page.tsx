"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

const tokenStorageKey = "localpro-admin-token";
const statuses: Array<{ value: StatusFilter; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" }
];

export default function AdminPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [profiles, setProfiles] = useState<Specialist[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const headers = useMemo<Record<string, string>>(() => {
    const nextHeaders: Record<string, string> = {};
    if (token) {
      nextHeaders["x-admin-token"] = token;
    }
    return nextHeaders;
  }, [token]);

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextToken = tokenInput.trim();
    if (!nextToken) {
      setMessage("Enter the admin token.");
      return;
    }

    localStorage.setItem(tokenStorageKey, nextToken);
    setToken(nextToken);
    setMessage("Admin token saved in this browser.");
  }

  function logout() {
    localStorage.removeItem(tokenStorageKey);
    setToken("");
    setTokenInput("");
    setProfiles([]);
    setDrafts({});
    setMessage("Logged out.");
  }

  async function loadProfiles() {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setMessage("Loading profiles...");

    try {
      const response = await fetch(`/api/admin/profiles?status=${status}`, { headers });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? "Could not load profiles.");
        return;
      }

      const nextProfiles: Specialist[] = data.profiles ?? [];
      setProfiles(nextProfiles);
      setDrafts(Object.fromEntries(nextProfiles.map((profile) => [profile.id, profileToDraft(profile)])));
      setMessage(data.mode === "seed" ? "Demo mode: Supabase is not connected." : `${nextProfiles.length} profile(s) loaded.`);
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
        ...headers
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
        ...headers
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

  function updateDraft(id: string, field: keyof EditDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value
      }
    }));
  }

  useEffect(() => {
    const savedToken = localStorage.getItem(tokenStorageKey) ?? "";
    if (savedToken) {
      setToken(savedToken);
      setTokenInput(savedToken);
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
        <button type="button" onClick={loadProfiles} disabled={isLoading}>
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <p className="admin-message">{message}</p>

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
