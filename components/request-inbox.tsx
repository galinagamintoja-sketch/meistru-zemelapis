"use client";
/* eslint-disable @next/next/no-img-element -- request photos use short-lived signed URLs */

import { useCallback, useEffect, useState } from "react";

type RequestSummary = {
  id: string; service: string; category: string; location: string; distanceKm: number | null; createdAt: string;
  description: string; photoCount: number; status: string; matchesServices: boolean; matchesRadius: boolean;
};
type RequestDetail = RequestSummary & {
  subcategory?: string; timing: string; preferredContact: string;
  photos: Array<{ id: string; name: string; url: string }>;
  contact: { name: string; phone?: string; email?: string } | null;
};

const filters = [
  ["new", "Naujos"], ["viewed", "Peržiūrėtos"], ["contacted", "Susisiekta"],
  ["interested", "Domina"], ["rejected", "Atmestos"], ["archived", "Archyvas"]
] as const;

export function RequestInbox({ completion, services }: { completion: number; services: string[] }) {
  const [filter, setFilter] = useState("new");
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextFilter: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/meistras/requests?status=${encodeURIComponent(nextFilter)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Užklausų įkelti nepavyko.");
      setRequests(data.requests ?? []); setCounts(data.counts ?? {});
    } catch (reason) {
      setRequests([]); setError(reason instanceof Error ? reason.message : "Užklausų įkelti nepavyko.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(filter); }, [filter, load]);

  async function open(id: string) {
    const response = await fetch(`/api/meistras/requests/${id}`);
    const data = await response.json();
    if (response.ok) { setDetail(data.request); void load(filter); }
  }
  async function act(action: string) {
    if (!detail) return;
    setMessage("Saugoma...");
    const response = await fetch(`/api/meistras/requests/${detail.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await response.json();
    setMessage(response.ok ? "Būsena atnaujinta." : data.error ?? "Atnaujinti nepavyko.");
    if (response.ok) { await open(detail.id); await load(filter); }
  }

  return <div className="request-inbox">
    <section className="request-stat-grid" aria-label="Užklausų statistika">
      <Stat icon="document" value={counts.new ?? 0} label="naujos" note="Laukia peržiūros" />
      <Stat icon="eye" value={counts.viewed ?? 0} label="peržiūrėtos" note="Per pastarąsias 30 d." />
      <Stat icon="message" value={counts.contacted ?? 0} label="susisiekta" note="Per pastarąsias 30 d." />
      <div className="request-stat completion-stat"><span className="completion-ring" style={{ "--completion": `${completion * 3.6}deg` } as React.CSSProperties}>{completion}%</span><div><strong>Profilio užpildymas</strong><small>{completion >= 90 ? "Puiku!" : "Užbaikite profilį"}</small></div></div>
    </section>
    <div className="request-filters" role="tablist" aria-label="Užklausų filtrai">
      {filters.map(([value, label]) => <button type="button" role="tab" key={value} aria-selected={filter === value} onClick={() => { setFilter(value); setDetail(null); }}>{label}<span>{counts[value] ?? 0}</span></button>)}
    </div>
    <div className="request-dashboard-layout"><div className="request-layout">
      <section className="request-list" aria-label="Užklausų sąrašas">
        {loading ? <div className="portal-card request-state" role="status">Kraunamos užklausos…</div> : error ? <div className="portal-card request-state" role="alert"><p>{error}</p><button className="portal-secondary" type="button" onClick={() => void load(filter)}>Bandyti dar kartą</button></div> : requests.length ? requests.map((item) => <button type="button" className="request-card" key={item.id} onClick={() => void open(item.id)}>
          <div className="request-card-head"><div><small>{formatDate(item.createdAt)}</small><h2>{item.service || item.category}</h2></div><span className={`status-badge ${item.status === "new" ? "status-warning" : "status-info"}`}>{statusLabel(item.status)}</span></div>
          <p>{item.location}{item.distanceKm !== null ? ` · apie ${item.distanceKm} km` : ""}</p>
          <p className="request-description">{item.description}</p>
          <div className="request-meta"><span>{item.photoCount} nuotr.</span><span>{item.matchesServices ? "Atitinka paslaugas" : "Neatitinka paslaugų"}</span><span>{item.matchesRadius ? "Darbo zonoje" : "Už darbo zonos"}</span></div>
        </button>) : <div className="portal-card"><p>Šiame aplanke užklausų nėra.</p></div>}
      </section>
      {detail ? <aside className="request-detail">
        <button className="request-detail-close" type="button" onClick={() => setDetail(null)} aria-label="Uždaryti">×</button>
        <p className="eyebrow">{detail.location} · {formatDate(detail.createdAt)}</p>
        <h2>{detail.service || detail.category}</h2>
        <dl><div><dt>Paslauga</dt><dd>{detail.subcategory || detail.category}</dd></div><div><dt>Pageidaujamas laikas</dt><dd>{timingLabel(detail.timing)}</dd></div><div><dt>Vieta</dt><dd>{detail.location} (apytikslė vietovė)</dd></div></dl>
        <p>{detail.description}</p>
        {detail.photos.length ? <div className="request-photos">{detail.photos.map((photo) => <img key={photo.id} src={photo.url} alt={photo.name || "Kliento darbų nuotrauka"} />)}</div> : null}
        {detail.contact ? <div className="request-contact"><strong>{detail.contact.name}</strong><div>
          {detail.contact.phone ? <><a href={`tel:${detail.contact.phone}`}>Skambinti</a><a href={`https://wa.me/${detail.contact.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a></> : null}
          {detail.contact.email ? <a href={`mailto:${detail.contact.email}`}>El. paštas</a> : null}
        </div></div> : <p className="request-policy">Kontaktai parodomi tik sąmoningai pasirinkus „Domina“ arba „Susisiekti“.</p>}
        <div className="request-actions">
          <button type="button" onClick={() => void act("interested")}>Domina</button>
          <button type="button" onClick={() => void act("contacted")}>Susisiekti</button>
          <button type="button" onClick={() => void act("rejected")}>Nedomina</button>
          <button type="button" onClick={() => void act("archived")}>Archyvuoti</button>
        </div>
        <p role="status">{message}</p>
      </aside> : null}
    </div><aside className="request-service-summary"><div><h2>Paslaugos</h2><a href="/meistras/paslaugos">Tvarkyti</a></div><p>Pasirinktos paslaugos</p><div>{services.slice(0, 8).map((service) => <span key={service}>{service}</span>)}</div>{services.length ? null : <p>Paslaugų dar nepasirinkta.</p>}<a className="portal-secondary" href="/meistras/paslaugos">Rodyti visas paslaugas</a></aside></div>
  </div>;
}

function Stat({ icon, value, label, note }: { icon: "document" | "eye" | "message"; value: number; label: string; note: string }) {
  const path = icon === "document"
    ? <><path d="M7 3.5h7l4 4V20H7z" /><path d="M14 3.5v4h4M10 12h5M10 15h5" /></>
    : icon === "eye"
      ? <><path d="M3 12s3.4-5 9-5 9 5 9 5-3.4 5-9 5-9-5-9-5Z" /><circle cx="12" cy="12" r="2.5" /></>
      : <path d="M5 5.5h14v10H9l-4 3z" />;
  return <div className="request-stat"><span className={`request-stat-icon is-${icon}`}><svg viewBox="0 0 24 24" aria-hidden="true">{path}</svg></span><div><strong>{value} <small>{label}</small></strong><span>{note}</span></div></div>;
}

function statusLabel(value: string) { return ({ new: "Nauja", viewed: "Peržiūrėta", interested: "Domina", contacted: "Susisiekta", accepted: "Priimta", rejected: "Atmesta", archived: "Archyvas" } as Record<string, string>)[value] ?? value; }
function timingLabel(value: string) { return ({ flexible: "Lankstus", within_week: "Per savaitę", urgent: "Skubu" } as Record<string, string>)[value] ?? value; }
function formatDate(value: string) { return new Intl.DateTimeFormat("lt-LT", { dateStyle: "medium" }).format(new Date(value)); }
