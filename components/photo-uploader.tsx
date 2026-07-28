"use client";
/* eslint-disable @next/next/no-img-element -- signed private previews cannot use the image optimizer */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REGISTRATION_PHOTO_MAX_ITEMS, mergeRegistrationPhotoSelections, uploadRegistrationPhotos, type RegistrationPhotoSelection } from "../lib/registration-photos";

type Photo = { id: string; name: string; url: string | null; status: string; rejectionReason?: string | null; isPrimary?: boolean };

export function PhotoUploader({ photos }: { photos: Photo[] }) {
  const router = useRouter();
  const [current, setCurrent] = useState(photos);
  const [filter, setFilter] = useState<"all" | "approved" | "pending" | "rejected">("all");
  const [queue, setQueue] = useState<RegistrationPhotoSelection[]>([]);
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const uploadingRef = useRef(false);
  useEffect(() => setCurrent(photos), [photos]);
  const visible = filter === "all" ? current : current.filter((photo) => photo.status === filter);
  const approvedCount = current.filter((photo) => photo.status === "approved").length;
  const pendingCount = current.filter((photo) => photo.status === "pending").length;
  const rejectedCount = current.filter((photo) => photo.status === "rejected").length;

  function select(files: FileList | null) {
    if (!files) return;
    const result = mergeRegistrationPhotoSelections(queue, Array.from(files), current.length - (replacementId ? 1 : 0), (value) => {
      const file = value as File;
      return { id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, type: file.type as RegistrationPhotoSelection["type"], size: file.size, lastModified: file.lastModified, previewUrl: URL.createObjectURL(file), file };
    });
    setQueue(result.next); setMessage(result.message || `${result.acceptedCount} nuotr. paruošta peržiūrai.`);
  }

  function move(id: string, by: number) {
    setQueue((items) => { const from = items.findIndex((item) => item.id === id); const to = from + by; if (to < 0 || to >= items.length) return items; const next = [...items]; [next[from], next[to]] = [next[to], next[from]]; return next; });
  }

  async function mutate(action: string, photoId: string) {
    const response = await fetch("/api/meistras/photos", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, photoId }) });
    const data = await response.json();
    setMessage(response.ok ? "Išsaugota." : data.error ?? "Veiksmas nepavyko.");
    if (response.ok && action === "primary") setCurrent((items) => items.map((item) => ({ ...item, isPrimary: item.id === photoId })));
    if (response.ok && action === "remove") setCurrent((items) => items.filter((item) => item.id !== photoId));
  }

  async function upload() {
    if (uploadingRef.current || !queue.length) return;
    uploadingRef.current = true;
    setIsUploading(true);
    setMessage("Įkeliama...");
    try {
    const plans = await Promise.all(queue.map(async (photo, index) => {
      const response = await fetch("/api/meistras/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", name: photo.name, type: photo.type, size: photo.size, replacePhotoId: index === 0 ? replacementId : null }) });
      return response.ok ? { ...(await response.json()), replacePhotoId: index === 0 ? replacementId : null } : undefined;
    }));
    const result = await uploadRegistrationPhotos(queue, plans as never, {
      directUpload: async (plan, photo, onProgress) => { if (!photo.file) throw new Error("Failas nerastas."); onProgress(10); const response = await fetch(plan.signedUrl, { method: "PUT", headers: { "content-type": photo.type }, body: photo.file }); if (!response.ok) throw new Error("Įkelti nepavyko."); onProgress(85); },
      finalize: async (plan) => { const extended = plan as typeof plan & { replacePhotoId?: string | null }; const response = await fetch("/api/meistras/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "finalize", uploadToken: plan.uploadToken, replacePhotoId: extended.replacePhotoId }) }); if (!response.ok) throw new Error((await response.json()).error ?? "Patvirtinti nepavyko."); },
      abort: async (plan) => { await fetch("/api/meistras/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "abort", uploadToken: plan.uploadToken }) }); },
      onProgress: (id, value) => setProgress((state) => ({ ...state, [id]: value }))
    });
    const succeeded = new Set(result.successes.map((photo) => photo.id));
    setCurrent((items) => [...items, ...result.successes.map((photo) => ({ id: `pending-${photo.id}`, name: photo.name, url: photo.previewUrl, status: "pending" }))]);
    setQueue((items) => items.filter((item) => !succeeded.has(item.id)));
    setReplacementId(null);
    setMessage(result.complete ? "Nuotraukos laukia administratoriaus patvirtinimo." : `${result.successes.length} įkelta, ${result.failures.length} nepavyko. Galite bandyti dar kartą.`);
    router.refresh();
    } finally {
      uploadingRef.current = false;
      setIsUploading(false);
    }
  }

  return <div className="portal-form">
    <section className="photo-summary"><div><strong>{current.length} iš {REGISTRATION_PHOTO_MAX_ITEMS} nuotraukų</strong><span>Jūsų darbų galerija</span></div><progress max={REGISTRATION_PHOTO_MAX_ITEMS} value={current.length} /></section>
    <div className="photo-filters" role="tablist" aria-label="Nuotraukų filtrai">
      {([["all", "Visos", current.length], ["approved", "Patvirtintos", approvedCount], ["pending", "Laukia", pendingCount], ["rejected", "Atmestos", rejectedCount]] as const).map(([value, label, count]) => <button type="button" role="tab" aria-selected={filter === value} key={value} onClick={() => setFilter(value)}>{label} ({count})</button>)}
    </div>
    <div className="tradesperson-photo-grid">{visible.map((photo) => <figure key={photo.id}>{photo.url ? <img src={photo.url} alt={photo.name} /> : <div className="photo-placeholder">Tikrinama</div>}<figcaption><span>{photo.name}{photo.isPrimary ? " · Pagrindinė" : ""}</span><span className={`status-badge ${photo.status === "approved" ? "status-success" : photo.status === "rejected" ? "status-danger" : "status-warning"}`}>{photo.status === "approved" ? "Patvirtinta" : photo.status === "rejected" ? "Atmesta" : "Laukia patvirtinimo"}</span>{photo.rejectionReason ? <small>Priežastis: {photo.rejectionReason}</small> : null}<div className="photo-actions">{photo.status === "approved" ? <><button type="button" onClick={() => void mutate("primary", photo.id)}>Pagrindinė</button><button type="button" onClick={() => { setReplacementId(photo.id); setMessage("Pasirinkite pakaitinę nuotrauką. Dabartinė liks vieša iki patvirtinimo."); }}>Pakeisti</button></> : <button type="button" onClick={() => void mutate("remove", photo.id)}>Pašalinti</button>}</div></figcaption></figure>)}</div>
    <label className="portal-secondary" aria-disabled={isUploading}>Pasirinkti nuotraukas<input hidden multiple type="file" disabled={isUploading} accept="image/jpeg,image/png,image/webp" onChange={(event) => { select(event.target.files); event.target.value = ""; }} /></label>
    <div className="photo-preview-queue">{queue.map((photo, index) => <article key={photo.id}><img src={photo.previewUrl} alt="" /><strong>{photo.name}</strong><progress max="100" value={progress[photo.id] ?? 0} /><div className="photo-actions"><button type="button" onClick={() => move(photo.id, -1)} disabled={!index}>↑</button><button type="button" onClick={() => move(photo.id, 1)} disabled={index === queue.length - 1}>↓</button><button type="button" onClick={() => setQueue((items) => items.filter((item) => item.id !== photo.id))}>Pašalinti</button></div></article>)}</div>
    <small>Iki {REGISTRATION_PHOTO_MAX_ITEMS} nuotraukų. Galite rinktis keliais kartais, peržiūrėti, pašalinti ir keisti eilę.</small>
    <button className="portal-primary" type="button" disabled={!queue.length || isUploading} onClick={() => void upload()}>{isUploading ? "Įkeliama…" : `Įkelti ${queue.length || ""} nuotr.`}</button><p role="status">{message}</p>
  </div>;
}
