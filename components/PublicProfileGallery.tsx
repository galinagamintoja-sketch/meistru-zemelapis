"use client";

import { useEffect, useState } from "react";
import SafeProfileImage from "./SafeProfileImage";

type Props = { name: string; trade: string; photoUrls: string[] };

export default function PublicProfileGallery({ name, trade, photoUrls }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (activeIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowLeft") setActiveIndex((current) => current === null ? null : (current - 1 + photoUrls.length) % photoUrls.length);
      if (event.key === "ArrowRight") setActiveIndex((current) => current === null ? null : (current + 1) % photoUrls.length);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, photoUrls.length]);

  return <>
    <button className="public-profile-hero-photo" type="button" onClick={() => photoUrls.length && setActiveIndex(0)} aria-label={photoUrls.length ? `Atidaryti ${name} darbų galeriją` : `${name} darbų nuotraukos nėra`} disabled={!photoUrls.length}>
      <SafeProfileImage src={photoUrls[0]} alt={`${name} pagrindinė darbų nuotrauka`} specialistName={name} trade={trade} loading="eager" fallbackText="Nuotraukos nėra" />
      {photoUrls.length ? <span>Peržiūrėti darbus</span> : null}
    </button>
    {photoUrls.length ? <section className="public-profile-gallery" aria-labelledby="public-profile-gallery-title">
      <h2 id="public-profile-gallery-title">Darbų nuotraukos</h2>
      <div className="photo-grid">
        {photoUrls.map((url, index) => <button type="button" className="public-profile-gallery-button" key={`${url}-${index}`} onClick={() => setActiveIndex(index)} aria-label={`Atidaryti nuotrauką ${index + 1} iš ${photoUrls.length}`}>
          <SafeProfileImage src={url} alt={`${name} darbų nuotrauka ${index + 1}`} specialistName={name} trade={trade} className="public-profile-photo" fallbackText="Nuotraukos nėra" />
        </button>)}
      </div>
    </section> : null}
    {activeIndex !== null ? <div className="profile-lightbox" role="dialog" aria-modal="true" aria-label={`${name} darbų galerija`} onClick={() => setActiveIndex(null)}>
      <div className="profile-lightbox-content" onClick={(event) => event.stopPropagation()}>
        <button className="profile-lightbox-close" type="button" onClick={() => setActiveIndex(null)} aria-label="Uždaryti galeriją">×</button>
        <SafeProfileImage src={photoUrls[activeIndex]} alt={`${name} darbų nuotrauka ${activeIndex + 1}`} specialistName={name} trade={trade} loading="eager" fallbackText="Nuotraukos nėra" />
        <div className="profile-lightbox-controls">
          <button type="button" onClick={() => setActiveIndex((activeIndex - 1 + photoUrls.length) % photoUrls.length)} aria-label="Ankstesnė nuotrauka">←</button>
          <span>{activeIndex + 1} / {photoUrls.length}</span>
          <button type="button" onClick={() => setActiveIndex((activeIndex + 1) % photoUrls.length)} aria-label="Kita nuotrauka">→</button>
        </div>
      </div>
    </div> : null}
  </>;
}
