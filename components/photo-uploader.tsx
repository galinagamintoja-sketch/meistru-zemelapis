"use client";

import { useState } from "react";
import { REGISTRATION_PHOTO_MAX_BYTES, REGISTRATION_PHOTO_TYPES } from "../lib/registration-photos";

export function PhotoUploader() {
  const [message, setMessage] = useState("");
  async function select(file?: File) {
    if (!file) return;
    if (!REGISTRATION_PHOTO_TYPES.includes(file.type as never) || file.size > REGISTRATION_PHOTO_MAX_BYTES) return setMessage("Rinkitės JPG, PNG arba WebP failą iki 5 MB.");
    setMessage("Ruošiamas įkėlimas...");
    const planResponse = await fetch("/api/meistras/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", name: file.name, type: file.type, size: file.size }) });
    const plan = await planResponse.json();
    if (!planResponse.ok) return setMessage(plan.error);
    try {
      const upload = await fetch(plan.signedUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!upload.ok) throw new Error("Failo įkelti nepavyko.");
      const finalize = await fetch("/api/meistras/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "finalize", uploadToken: plan.uploadToken }) });
      const result = await finalize.json();
      if (!finalize.ok) throw new Error(result.error);
      setMessage("Nuotrauka įkelta ir laukia administratoriaus patvirtinimo.");
    } catch (error) {
      await fetch("/api/meistras/photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "abort", uploadToken: plan.uploadToken }) });
      setMessage(error instanceof Error ? error.message : "Įkelti nepavyko.");
    }
  }
  return <div className="portal-form"><label>Pridėti darbų nuotrauką<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void select(event.target.files?.[0])} /></label><p role="status">{message}</p></div>;
}
