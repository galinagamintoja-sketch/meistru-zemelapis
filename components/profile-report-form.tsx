"use client";

import { FormEvent, useState } from "react";
import { profileReportReasonLabels, profileReportReasons } from "../lib/profile-reports";

export function ProfileReportForm({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setMessage("Siunčiama...");
    try {
      const response = await fetch("/api/profile-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profileId,
          reason: data.get("reason"),
          details: data.get("details"),
          reporterEmail: data.get("reporterEmail"),
          website: data.get("website")
        })
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "Pranešimo išsiųsti nepavyko.");
        return;
      }
      form.reset();
      setMessage("Ačiū. Pranešimas perduotas LocalPro administratoriui.");
    } catch {
      setMessage("Pranešimo išsiųsti nepavyko. Bandykite dar kartą.");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="profile-report">
    <button type="button" className="profile-report-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      Pranešti apie profilį
    </button>
    {open ? <form onSubmit={submit} className="profile-report-form">
      <label>Problema
        <select name="reason" required defaultValue="">
          <option value="" disabled>Pasirinkite</option>
          {profileReportReasons.map((reason) => <option value={reason} key={reason}>{profileReportReasonLabels[reason]}</option>)}
        </select>
      </label>
      <label>Trumpai paaiškinkite
        <textarea name="details" required minLength={10} maxLength={1000} rows={4} />
      </label>
      <label>Jūsų el. paštas (neprivaloma)
        <input name="reporterEmail" type="email" autoComplete="email" />
      </label>
      <label className="report-honeypot" aria-hidden="true">Svetainė<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <button type="submit" disabled={submitting}>{submitting ? "Siunčiama..." : "Siųsti pranešimą"}</button>
      {message ? <p role="status">{message}</p> : null}
    </form> : null}
  </div>;
}
