"use client";

import { useEffect, useRef, useState } from "react";
import SafeProfileImage from "./SafeProfileImage";

type Props = { name: string; trade: string; photoUrls: string[] };

export default function PublicProfileGallery({ name, trade, photoUrls }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  function openGallery(index: number, opener: HTMLButtonElement) {
    openerRef.current = opener;
    setActiveIndex(index);
  }

  function closeGallery() {
    dialogRef.current?.close();
    setActiveIndex(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }

  useEffect(() => {
    if (activeIndex === null) return;
    dialogRef.current?.showModal();
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeGallery(); }
      if (event.key === "ArrowLeft") setActiveIndex((current) => current === null ? null : (current - 1 + photoUrls.length) % photoUrls.length);
      if (event.key === "ArrowRight") setActiveIndex((current) => current === null ? null : (current + 1) % photoUrls.length);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeIndex, photoUrls.length]);

  return <>
    <button className="public-profile-hero-photo" type="button" onClick={(event) => photoUrls.length && openGallery(0, event.currentTarget)} aria-label={photoUrls.length ? `Atidaryti ${name} darbų galeriją` : `${name} darbų nuotraukos nėra`} disabled={!photoUrls.length}>
      <SafeProfileImage src={photoUrls[0]} alt={`${name} pagrindinė darbų nuotrauka`} specialistName={name} trade={trade} loading="eager" fallbackText="Nuotraukos nėra" />
      {photoUrls.length ? <span>Peržiūrėti darbus</span> : null}
    </button>
    {photoUrls.length ? <section className="public-profile-gallery" aria-labelledby="public-profile-gallery-title">
      <h2 id="public-profile-gallery-title">Darbų nuotraukos</h2>
      <div className="photo-grid">
        {photoUrls.map((url, index) => <button type="button" className="public-profile-gallery-button" key={`${url}-${index}`} onClick={(event) => openGallery(index, event.currentTarget)} aria-label={`Atidaryti nuotrauką ${index + 1} iš ${photoUrls.length}`}>
          <SafeProfileImage src={url} alt={`${name} darbų nuotrauka ${index + 1}`} specialistName={name} trade={trade} className="public-profile-photo" fallbackText="Nuotraukos nėra" />
        </button>)}
      </div>
    </section> : null}
    {activeIndex !== null ? <dialog ref={dialogRef} className="profile-lightbox" role="dialog" aria-modal="true" aria-label={`${name} darbų galerija`} onCancel={(event) => { event.preventDefault(); closeGallery(); }} onClick={(event) => { if (event.target === event.currentTarget) closeGallery(); }}>
      <div className="profile-lightbox-content">
        <button className="profile-lightbox-close" type="button" onClick={closeGallery} aria-label="Uždaryti galeriją">×</button>
        <SafeProfileImage src={photoUrls[activeIndex]} alt={`${name} darbų nuotrauka ${activeIndex + 1}`} specialistName={name} trade={trade} loading="eager" fallbackText="Nuotraukos nėra" />
        <div className="profile-lightbox-controls">
          <button type="button" onClick={() => setActiveIndex((activeIndex - 1 + photoUrls.length) % photoUrls.length)} aria-label="Ankstesnė nuotrauka">←</button>
          <span>{activeIndex + 1} / {photoUrls.length}</span>
          <button type="button" onClick={() => setActiveIndex((activeIndex + 1) % photoUrls.length)} aria-label="Kita nuotrauka">→</button>
        </div>
      </div>
    </dialog> : null}
  </>;
}
