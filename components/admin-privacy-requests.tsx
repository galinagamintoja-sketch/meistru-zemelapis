"use client";
import { useEffect, useState } from "react";

type Item = { id: string; status: string; scheduledDeletionAt: string | null; attemptCount: number; lastError: string | null };
type Data = { counts: Record<string, number>; requests: Item[] };

export function AdminPrivacyRequests() {
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState("");
  async function load() {
    const response = await fetch("/api/admin/privacy-requests");
    const body = await response.json();
    if (response.ok) setData(body); else setMessage(body.error ?? "Privatumo prašymų įkelti nepavyko.");
  }
  useEffect(() => { void load(); }, []);
  async function retry(requestId: string) {
    setMessage("Kartojamas ištrynimas…");
    const response = await fetch("/api/admin/privacy-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId }) });
    const body = await response.json();
    setMessage(response.ok ? `Užbaigta: ${body.completed}; nepavyko: ${body.failed}.` : body.error ?? "Pakartoti nepavyko.");
    await load();
  }
  return <section className="admin-add-panel" aria-labelledby="privacy-requests-heading">
    <h2 id="privacy-requests-heading">Privatumo prašymai</h2>
    {data ? <><div className="privacy-request-counts"><span>Laukiantys: <strong>{data.counts.pending ?? 0}</strong></span><span>Vykdomi: <strong>{data.counts.processing ?? 0}</strong></span><span>Nepavykę: <strong>{data.counts.failed ?? 0}</strong></span><span>Užbaigti: <strong>{data.counts.completed ?? 0}</strong></span></div>
      <ul className="privacy-request-list">{data.requests.filter((item) => item.status !== "cancelled").map((item) => <li key={item.id}><span>{statusLabel(item.status)}</span><span>{item.scheduledDeletionAt ? new Date(item.scheduledDeletionAt).toLocaleString("lt-LT") : "Data nebetaikoma"}</span><span>Bandymai: {item.attemptCount}</span>{item.lastError ? <span>Klaida: {item.lastError}</span> : null}{item.status === "failed" ? <button type="button" onClick={() => void retry(item.id)}>Pakartoti nepavykusį ištrynimą</button> : null}</li>)}</ul></> : null}
    <p role="status">{message}</p>
  </section>;
}

function statusLabel(status: string) {
  return ({ pending: "Suplanuotas", processing: "Vykdomas", failed: "Nepavyko", completed: "Užbaigtas" } as Record<string, string>)[status] ?? status;
}
