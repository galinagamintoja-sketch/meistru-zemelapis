"use client";

import { useCallback, useEffect, useState } from "react";

type Dashboard = {
  active_jobs: number; expired_jobs: number; imports_today: number; duplicates_today: number;
  failures_today: number; rejected_by_reason: Record<string, number>;
  recent_failures: Array<{ reason_code: string; received_at: string }>;
  jobs: Array<{ id: string; title: string; source_url: string; status: string; posted_at: string; expires_at: string }>;
};

export default function AdminJobsClient() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/public-jobs", { cache: "no-store" });
    if (!response.ok) { setError(true); return; }
    setDashboard(await response.json()); setError(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function moderate(id: string, status: "hidden" | "closed") {
    const response = await fetch("/api/admin/public-jobs", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: id, status }) });
    if (!response.ok) { setError(true); return; }
    await load();
  }
  if (error) return <p role="alert">Administravimo duomenų įkelti nepavyko.</p>;
  if (!dashboard) return <p>Įkeliama…</p>;
  return <>
    <p>Aktyvūs: {dashboard.active_jobs} · Pasibaigę: {dashboard.expired_jobs} · Importuoti šiandien: {dashboard.imports_today} · Dublikatai: {dashboard.duplicates_today} · Klaidos: {dashboard.failures_today}</p>
    <p>Atmesta: {Object.entries(dashboard.rejected_by_reason).map(([reason, count]) => `${reason}: ${count}`).join(", ") || "0"}</p>
    {dashboard.recent_failures.length > 0 && <section><h2>Naujausios importo klaidos</h2><ul>{dashboard.recent_failures.map((failure, index) =>
      <li key={`${failure.received_at}-${index}`}>{failure.received_at}: {failure.reason_code}</li>)}</ul></section>}
    <h2>Naujausi skelbimai</h2>
    <ul style={{ display: "grid", gap: 16, paddingLeft: 20 }}>{dashboard.jobs.map((job) => <li key={job.id}>
      <strong>{job.title}</strong> · {job.status} · <a href={job.source_url} target="_blank" rel="noopener noreferrer">Šaltinis ↗</a>
      {job.status === "active" && new Date(job.expires_at) > new Date() ? <span> · <button onClick={() => void moderate(job.id, "hidden")}>Slėpti</button> <button onClick={() => void moderate(job.id, "closed")}>Uždaryti</button></span> : null}
    </li>)}</ul>
  </>;
}
