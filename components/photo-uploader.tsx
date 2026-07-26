"use client";

import { useState } from "react";
import {
  REGISTRATION_PHOTO_MAX_BYTES,
  REGISTRATION_PHOTO_TYPES,
  uploadRegistrationPhotos,
  type RegistrationPhotoSelection
} from "../lib/registration-photos";

export function PhotoUploader({ photos }: { photos: Array<{ id: string; name: string; url: string | null; status: string }> }) {
  const [message, setMessage] = useState("");
  async function select(file?: File) {
    if (!file) return;
    if (!REGISTRATION_PHOTO_TYPES.includes(file.type as never) || file.size > REGISTRATION_PHOTO_MAX_BYTES) return setMessage("Rinkitės JPG, PNG arba WebP failą iki 5 MB.");
    const selection: RegistrationPhotoSelection = {
      id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name,
      type: file.type as RegistrationPhotoSelection["type"], size: file.size,
      lastModified: file.lastModified, previewUrl: URL.createObjectURL(file), file
    };
    setMessage("Ruošiamas įkėlimas...");
    const planResponse = await fetch("/api/meistras/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", name: file.name, type: file.type, size: file.size }) });
    const plan = await planResponse.json();
    if (!planResponse.ok) return setMessage(plan.error);
    const result = await uploadRegistrationPhotos([selection], [plan], {
      directUpload: async (uploadPlan, photo) => {
        if (!photo.file) throw new Error("Nuotraukos failas nerastas.");
        const response = await fetch(uploadPlan.signedUrl, { method: "PUT", headers: { "content-type": photo.type }, body: photo.file });
        if (!response.ok) throw new Error("Tiesioginis nuotraukos įkėlimas nepavyko.");
      },
      finalize: async (uploadPlan) => {
        const response = await fetch("/api/meistras/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "finalize", uploadToken: uploadPlan.uploadToken }) });
        if (!response.ok) throw new Error((await response.json()).error ?? "Nuotraukos patvirtinti nepavyko.");
      },
      abort: async (uploadPlan) => { await fetch("/api/meistras/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "abort", uploadToken: uploadPlan.uploadToken }) }); }
    });
    URL.revokeObjectURL(selection.previewUrl);
    setMessage(result.complete ? "Nuotrauka įkelta ir laukia administratoriaus patvirtinimo. Patvirtintos nuotraukos liko nepakeistos." : result.failures[0]?.message ?? "Įkelti nepavyko.");
  }
  return <div className="portal-form">
    <div className="tradesperson-photo-grid">{photos.map((photo) => <figure key={photo.id}>{photo.url ? <img src={photo.url} alt={photo.name} /> : <div className="photo-placeholder">Tikrinama</div>}<figcaption><span>{photo.name}</span><span className={`status-badge ${photo.status === "approved" ? "status-success" : "status-warning"}`}>{photo.status === "approved" ? "Patvirtinta" : "Laukia patvirtinimo"}</span></figcaption></figure>)}</div>
    <label className="portal-primary">Pridėti darbų nuotrauką<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void select(event.target.files?.[0])} /></label>
    <p role="status">{message}</p>
  </div>;
}
