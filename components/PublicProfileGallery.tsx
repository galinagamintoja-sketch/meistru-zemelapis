"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SafeProfileImage from "./SafeProfileImage";
import { defaultTradePhoto } from "../lib/default-trade-photo";
import { profilePhotoAlt } from "../lib/photo-alt";

type Props = { name: string; trade: string; categorySlug: string; photoUrls: string[]; photoLabels?: Record<string, string> };

export default function PublicProfileGallery({ name, trade, categorySlug, photoUrls, photoLabels }: Props) {
  const photoAlt = (index: number) => profilePhotoAlt(name, photoLabels?.[photoUrls[index]], index);
  const [hydrated, setHydrated] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const swipeStart = useRef<{ x: number; y: number; id: number } | null>(null);

  function navigate(direction: number) {
    setActiveIndex((current) => current === null ? null : (current + direction + photoUrls.length) % photoUrls.length);
  }

  useEffect(() => setHydrated(true), []);

  function openGallery(index: number, opener: HTMLButtonElement) {
    openerRef.current = opener;
    setActiveIndex(index);
  }

  function closeGallery() {
    dialogRef.current?.close();
    setActiveIndex(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }

  const mountDialog = useCallback((dialog: HTMLDialogElement | null) => {
    dialogRef.current = dialog;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    window.requestAnimationFrame(() => closeRef.current?.focus());
  }, []);

  useEffect(() => {
    if (activeIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeGallery(); }
      if (event.key === "ArrowLeft") setActiveIndex((current) => current === null ? null : (current - 1 + photoUrls.length) % photoUrls.length);
      if (event.key === "ArrowRight") setActiveIndex((current) => current === null ? null : (current + 1) % photoUrls.length);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [activeIndex, photoUrls.length]);

  return <>
    <button className="public-profile-hero-photo" type="button" data-gallery-ready={hydrated || undefined} onClick={(event) => photoUrls.length && openGallery(0, event.currentTarget)} aria-label={photoUrls.length ? `Atidaryti ${name} darbų galeriją` : `${trade} iliustracinė nuotrauka`} disabled={!photoUrls.length || !hydrated}>
      <SafeProfileImage src={photoUrls[0] ?? defaultTradePhoto(categorySlug)} alt={photoUrls.length ? photoAlt(0) : `${trade} iliustracinė nuotrauka`} specialistName={name} trade={trade} loading="eager" sizes="(max-width: 620px) 58vw, 220px" fallbackText="Nuotraukos nėra" />
      {photoUrls.length ? <span>Peržiūrėti darbus</span> : null}
      {!photoUrls.length ? <span>Iliustracinė nuotrauka</span> : null}
    </button>
    {photoUrls.length ? <section className="public-profile-gallery" aria-labelledby="public-profile-gallery-title">
      <h2 id="public-profile-gallery-title">Darbų nuotraukos</h2>
      <div className="photo-grid">
        {photoUrls.map((url, index) => <button type="button" disabled={!hydrated} className="public-profile-gallery-button" key={`${url}-${index}`} onClick={(event) => openGallery(index, event.currentTarget)} aria-label={`Atidaryti nuotrauką ${index + 1} iš ${photoUrls.length}`}>
          <SafeProfileImage src={url} alt={photoAlt(index)} specialistName={name} trade={trade} className="public-profile-photo" sizes="(max-width: 620px) 100vw, 50vw" fallbackText="Nuotraukos nėra" />
        </button>)}
      </div>
    </section> : null}
    {activeIndex !== null ? <dialog ref={mountDialog} className="profile-lightbox" role="dialog" aria-modal="true" aria-label={`${name} darbų galerija`} onCancel={(event) => { event.preventDefault(); closeGallery(); }} onClick={(event) => { if (event.target === event.currentTarget) closeGallery(); }}>
      <div className="profile-lightbox-content">
        <button ref={closeRef} className="profile-lightbox-close" type="button" onClick={closeGallery} aria-label="Uždaryti galeriją">×</button>
        {/* Next Image fill needs a definite, viewport-sized stage, not an auto-height wrapper. */}
        <div className="profile-lightbox-stage"
          onPointerDown={(event) => {
            if (!event.isPrimary) { swipeStart.current = null; return; }
            if (event.pointerType === "mouse") return;
            swipeStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
            if (event.nativeEvent.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { swipeStart.current = null; }}
          onPointerUp={(event) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (!start || start.id !== event.pointerId) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) navigate(dx < 0 ? 1 : -1);
          }}>
          <SafeProfileImage key={photoUrls[activeIndex]} src={photoUrls[activeIndex]} alt={photoAlt(activeIndex)} specialistName={name} trade={trade} loading="eager" sizes="(max-width: 960px) 100vw, 920px" fallbackText="Nuotraukos nėra" />
        </div>
        <div className="profile-lightbox-controls">
          <button type="button" onClick={() => navigate(-1)} aria-label="Ankstesnė nuotrauka">←</button>
          <span aria-live="polite" aria-atomic="true">{activeIndex + 1} / {photoUrls.length}</span>
          <button type="button" onClick={() => navigate(1)} aria-label="Kita nuotrauka">→</button>
        </div>
      </div>
    </dialog> : null}
  </>;
}
