"use client";

import { useEffect, useState } from "react";

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
  ["accepted", "Priimtos"], ["rejected", "Atmestos"], ["archived", "Archyvas"]
] as const;

export function RequestInbox() {
  const [filter, setFilter] = useState("new");
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [message, setMessage] = useState("");

  async function load(nextFilter = filter) {
    const response = await fetch(`/api/meistras/requests?status=${encodeURIComponent(nextFilter)}`);
    const data = await response.json();
    setRequests(data.requests ?? []); setCounts(data.counts ?? {});
  }
  useEffect(() => { void load(filter); }, [filter]);

  async function open(id: string) {
    const response = await fetch(`/api/meistras/requests/${id}`);
    const data = await response.json();
    if (response.ok) { setDetail(data.request); void load(); }
  }
  async function act(action: string) {
    if (!detail) return;
    setMessage("Saugoma...");
    const response = await fetch(`/api/meistras/requests/${detail.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await response.json();
    setMessage(response.ok ? "Būsena atnaujinta." : data.error ?? "Atnaujinti nepavyko.");
    if (response.ok) { await open(detail.id); await load(); }
  }

  return <div className="request-inbox">
    <p className="request-new-count"><strong>{counts.new ?? 0}</strong> naujų užklausų</p>
    <div className="request-filters" role="tablist" aria-label="Užklausų filtrai">
      {filters.map(([value, label]) => <button type="button" key={value} aria-selected={filter === value} onClick={() => { setFilter(value); setDetail(null); }}>{label}<span>{counts[value] ?? 0}</span></button>)}
    </div>
    <div className="request-layout">
      <section className="request-list" aria-label="Užklausų sąrašas">
        {requests.length ? requests.map((item) => <button type="button" className="request-card" key={item.id} onClick={() => void open(item.id)}>
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
    </div>
  </div>;
}

function statusLabel(value: string) { return ({ new: "Nauja", viewed: "Peržiūrėta", interested: "Domina", contacted: "Susisiekta", accepted: "Priimta", rejected: "Atmesta", archived: "Archyvas" } as Record<string, string>)[value] ?? value; }
function timingLabel(value: string) { return ({ flexible: "Lankstus", within_week: "Per savaitę", urgent: "Skubu" } as Record<string, string>)[value] ?? value; }
function formatDate(value: string) { return new Intl.DateTimeFormat("lt-LT", { dateStyle: "medium" }).format(new Date(value)); }
