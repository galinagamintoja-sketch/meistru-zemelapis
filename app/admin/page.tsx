"use client";

import { useEffect, useMemo, useState } from "react";
import type { Specialist } from "../../lib/types";

const statuses = ["pending", "approved", "rejected", "suspended", "all"];

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("pending");
  const [profiles, setProfiles] = useState<Specialist[]>([]);
  const [message, setMessage] = useState("");

  const headers = useMemo<Record<string, string>>(() => {
    const nextHeaders: Record<string, string> = {};
    if (token) {
      nextHeaders["x-admin-token"] = token;
    }
    return nextHeaders;
  }, [token]);

  async function loadProfiles() {
    setMessage("Kraunama...");
    const response = await fetch(`/api/admin/profiles?status=${status}`, { headers });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? "Nepavyko įkelti profilių");
      return;
    }

    setProfiles(data.profiles ?? []);
    setMessage(data.mode === "seed" ? "Demo režimas: Supabase dar neprijungtas." : "Duomenys iš duomenų bazės.");
  }

  async function runAction(id: string, action: string) {
    const response = await fetch("/api/admin/profiles", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body: JSON.stringify({ id, action })
    });
    const data = await response.json();
    setMessage(response.ok ? "Veiksmas išsaugotas." : data.error ?? "Veiksmas nepavyko");
    await loadProfiles();
  }

  useEffect(() => {
    loadProfiles().catch(() => setMessage("Nepavyko įkelti profilių"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <main className="admin-shell">
      <section className="section-heading">
        <p className="eyebrow">LocalPro admin</p>
        <h1>Profiliai, patikra ir publikavimas</h1>
        <p>Peržiūrėkite naujas registracijas, patvirtinkite kontaktus ir publikuokite tik su sutikimu.</p>
      </section>

      <div className="admin-toolbar">
        <label>
          Admin token
          <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="ADMIN_TOKEN" type="password" />
        </label>
        <label>
          Būsena
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={loadProfiles}>Atnaujinti</button>
      </div>

      <p className="admin-message">{message}</p>

      <section className="admin-grid">
        {profiles.map((profile) => (
          <article className="admin-card" key={profile.id}>
            <div>
              <p className="eyebrow">{profile.status} / {profile.source}</p>
              <h2>{profile.name}</h2>
              <p>{profile.trade} · {profile.town} · dirba: {profile.operatingCities.join(", ")}</p>
              <p>{profile.description}</p>
            </div>
            <div className="admin-meta">
              <span>{profile.phone}</span>
              <span>{profile.email}</span>
              <span>WhatsApp: {profile.whatsapp}</span>
              <span>{profile.verificationLabel}</span>
            </div>
            <div className="admin-actions">
              <button type="button" onClick={() => runAction(profile.id, "approve")}>Patvirtinti</button>
              <button type="button" onClick={() => runAction(profile.id, "verify_contact")}>Kontaktas OK</button>
              <button type="button" onClick={() => runAction(profile.id, "verify_whatsapp")}>WhatsApp OK</button>
              <button type="button" onClick={() => runAction(profile.id, "reject")}>Atmesti</button>
              <button type="button" onClick={() => runAction(profile.id, "suspend")}>Slėpti</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
