import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatVerificationSummary } from "../../../lib/display";
import { getSpecialist } from "../../../lib/specialists";

type PageProps = { params: Promise<{ slugOrId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slugOrId } = await params;
  const specialist = await getSpecialist(slugOrId);
  if (!specialist) return { title: "Specialistas nerastas | LocalPro.lt" };

  const title = `${specialist.companyName || specialist.name} – ${specialist.trade} | LocalPro.lt`;
  return {
    title,
    description: `${specialist.trade}: ${specialist.approximateLocation || specialist.town}. ${specialist.description}`.slice(0, 160)
  };
}

export default async function SpecialistPage({ params }: PageProps) {
  const { slugOrId } = await params;
  const specialist = await getSpecialist(slugOrId);
  if (!specialist) notFound();

  const services = [...(specialist.categoryNames ?? [specialist.trade]), ...(specialist.subcategoryNames ?? [])];
  const whatsapp = specialist.whatsapp.replace(/[^\d]/g, "");

  return (
    <main className="public-profile-shell">
      <nav className="public-profile-nav" aria-label="Profilio navigacija">
        <Link className="brand" href="/">LocalPro.lt</Link>
        <Link href="/#mapSection">← Grįžti į žemėlapį</Link>
      </nav>

      <article className="public-profile-card">
        <header className="public-profile-header">
          <p className="eyebrow">Patvirtintas viešas profilis</p>
          <h1>{specialist.companyName || specialist.name}</h1>
          {specialist.companyName ? <p className="public-profile-person">{specialist.name}</p> : null}
          <div className="tag-row">
            <span className="tag">{specialist.trade}</span>
            <span className="tag">{specialist.approximateLocation || specialist.town}</span>
            <span className="tag">Iki {specialist.radius} km</span>
          </div>
        </header>

        <section className="public-profile-grid">
          <div className="public-profile-main">
            <section>
              <h2>Apie specialistą</h2>
              <p>{specialist.description}</p>
            </section>
            <section>
              <h2>Paslaugos</h2>
              <div className="tag-row">{Array.from(new Set(services)).map((service) => <span className="tag" key={service}>{service}</span>)}</div>
            </section>
            <section>
              <h2>Darbo zona</h2>
              <p>{specialist.serviceArea}</p>
              <p className="privacy-note">Rodoma tik apytikslė vietovė. Registracijos adresas ir tikslios koordinatės neviešinami.</p>
            </section>
            <section>
              <h2>Patvirtinimas</h2>
              <p>{formatVerificationSummary(specialist.verification)}</p>
            </section>
          </div>

          <aside className="public-profile-actions" aria-label="Susisiekti">
            <a className="primary-action" href={`tel:${specialist.phone.replaceAll(" ", "")}`}>Skambinti</a>
            <a className="secondary-action" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">Rašyti per WhatsApp</a>
            <Link href="/#mapSection">Grįžti į žemėlapį</Link>
          </aside>
        </section>

        {specialist.photoUrls?.length ? (
          <section className="public-profile-gallery">
            <h2>Darbų nuotraukos</h2>
            <div className="photo-grid">
              {specialist.photoUrls.map((url, index) => (
                <div className="public-profile-photo" key={url}>
                  <Image src={url} alt={`${specialist.name} darbų nuotrauka ${index + 1}`} fill sizes="(max-width: 760px) 100vw, 33vw" unoptimized />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </main>
  );
}
