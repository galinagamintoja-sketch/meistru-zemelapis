"use client";

import { useEffect, useState } from "react";

type RecentPhoto = {
  id: string; label: string | null; moderation_status: "pending" | "approved" | "rejected";
  removed_from_profile_at: string | null; created_at: string; preview_url: string | null;
  tradesperson_profiles: { id: string; display_name: string; company_name: string | null } | null;
};

export function AdminRecentPhotos() {
  const [photos, setPhotos] = useState<RecentPhoto[]>([]);
  const [message, setMessage] = useState("");
  async function load() {
    const response = await fetch("/api/admin/recent-photos");
    const data = await response.json();
    if (response.ok) setPhotos(data.photos ?? []); else setMessage(data.error ?? "Nuotraukų įkelti nepavyko.");
  }
  useEffect(() => { void load(); }, []);
  async function hide(photo: RecentPhoto) {
    const profile = photo.tradesperson_profiles;
    if (!profile) return;
    const response = await fetch("/api/admin/profiles", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: profile.id, action: "moderate_photo", photoId: photo.id, moderationStatus: "rejected" }) });
    const data = await response.json();
    setMessage(response.ok ? "Nuotrauka paslėpta." : data.error ?? "Nuotraukos paslėpti nepavyko.");
    if (response.ok) await load();
  }
  return <section className="admin-add-panel"><div className="admin-card-header"><div><p className="eyebrow">Stebėjimo eilė</p><h2>Naujos nuotraukos</h2><p>Naujausi įkėlimai. Nuotraukos skelbiamos iš karto ir gali būti paslėptos po patikros.</p></div><button className="admin-secondary" type="button" onClick={load}>Atnaujinti</button></div>
    <p className="admin-message">{message}</p><div className="admin-grid">{photos.length ? photos.map((photo) => { const profile = photo.tradesperson_profiles; return <article className="admin-card" key={photo.id}>
      {/* Signed private-storage URLs are short-lived and cannot be configured as a stable next/image remote source. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo.preview_url ? <img className="admin-recent-photo" src={photo.preview_url} alt={photo.label || "Profilio nuotrauka"} /> : <div className="photo-placeholder">Peržiūra nepasiekiama</div>}
      <h3>{profile?.company_name || profile?.display_name || "Profilis pašalintas"}</h3><p>{new Date(photo.created_at).toLocaleString("lt-LT")} · {photo.removed_from_profile_at ? "pašalinta" : photo.moderation_status}</p>
      {profile ? <div className="admin-meta"><a href={`/specialist/${profile.id}`}>Viešas profilis</a><a href={`#profile-${profile.id}`}>Admin profilis</a></div> : null}
      {!photo.removed_from_profile_at && photo.moderation_status !== "rejected" ? <button className="admin-danger" type="button" onClick={() => void hide(photo)}>Paslėpti / atmesti</button> : null}
    </article>; }) : <p>Naujų nuotraukų nėra.</p>}</div></section>;
}
