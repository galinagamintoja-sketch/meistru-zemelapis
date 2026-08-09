"use client";

import { useCallback, useEffect, useState } from "react";
import { profileReportReasonLabels } from "../lib/profile-reports";

type Report = {
  id: string;
  reason: keyof typeof profileReportReasonLabels;
  details: string;
  reporter_email: string | null;
  status: "pending" | "reviewing" | "resolved" | "dismissed";
  admin_notes: string | null;
  created_at: string;
  tradesperson_profiles: { id: string; display_name: string; company_name: string | null } | null;
};

export function AdminProfileReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/profile-reports");
    const body = await response.json();
    if (!response.ok) return setMessage(body.error ?? "Pranešimų įkelti nepavyko.");
    setReports(body.reports ?? []);
    setMessage("");
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function update(reportId: string, status: "reviewing" | "resolved" | "dismissed") {
    const response = await fetch("/api/admin/profile-reports", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportId, status, adminNotes: "" })
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error ?? "Pranešimo atnaujinti nepavyko.");
    await load();
  }

  const openCount = reports.filter((report) => report.status === "pending" || report.status === "reviewing").length;
  return <section className="admin-add-panel" aria-labelledby="profile-reports-heading">
    <div className="admin-card-header"><div><p className="eyebrow">Bendruomenės moderavimas</p><h2 id="profile-reports-heading">Pranešimai apie profilius ({openCount})</h2></div><button className="admin-secondary" type="button" onClick={() => void load()}>Atnaujinti</button></div>
    {message ? <p className="admin-message" role="status">{message}</p> : null}
    <div className="admin-grid">{reports.length ? reports.map((report) => {
      const profile = Array.isArray(report.tradesperson_profiles) ? report.tradesperson_profiles[0] : report.tradesperson_profiles;
      return <article className="admin-card" key={report.id}>
        <div className="admin-card-header"><div><p className="eyebrow">{profileReportReasonLabels[report.reason] ?? report.reason}</p><h3>{profile?.company_name || profile?.display_name || "Pašalintas profilis"}</h3></div><span className="tag">{report.status}</span></div>
        <p>{report.details}</p>
        <p>{new Date(report.created_at).toLocaleString("lt-LT")}{report.reporter_email ? ` · ${report.reporter_email}` : ""}</p>
        {profile?.id ? <a href={`/specialist/${profile.id}`} target="_blank" rel="noreferrer">Atidaryti profilį</a> : null}
        <div className="admin-actions">
          <button type="button" onClick={() => void update(report.id, "reviewing")}>Tikrinama</button>
          <button type="button" onClick={() => void update(report.id, "resolved")}>Išspręsta</button>
          <button type="button" className="admin-secondary" onClick={() => void update(report.id, "dismissed")}>Atmesti pranešimą</button>
        </div>
      </article>;
    }) : <p>Pranešimų nėra.</p>}</div>
  </section>;
}
