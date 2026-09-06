import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import LocalProPreviewBrand from "../../../components/LocalProPreviewBrand";
import PublicProfileGallery from "../../../components/PublicProfileGallery";
import { ProfileReportForm } from "../../../components/profile-report-form";
import { formatVerificationSummary } from "../../../lib/display";
import { getPublicSpecialistBySeoSlug } from "../../../lib/specialists";
import { categoryLocationPath, isSeoEligible, profileJsonLd, profileMetadata, profilePath, profileSeoSlug, safeJsonLd } from "../../../lib/seo";
import { specialists as seedSpecialists } from "../../../lib/seed-data";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const profile = await getProfile((await params).slug);
  if (!profile) return { title: "Meistras nerastas | LocalPro", robots: { index: false, follow: false } };
  const metadata = profileMetadata(profile);
  return isSeoEligible(profile) ? metadata : { ...metadata, robots: { index: false, follow: true } };
}

export default async function PublicTradespersonPage({ params }: PageProps) {
  const profile = await getProfile((await params).slug);
  if (!profile) notFound();
  if ((await params).slug !== profilePath(profile).split("/").pop()) permanentRedirect(profilePath(profile));
  const whatsapp = profile.whatsapp.replace(/[^\d]/g, "");
  const landingLinks = profile.operatingCities.map((city) => ({ city, path: categoryLocationPath(profile, city) })).filter((item) => item.path);
  return <main className="public-profile-shell">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(profileJsonLd(profile)) }} />
    <nav className="public-profile-nav" aria-label="Profilio navigacija"><Link className="public-profile-brand" href="/" aria-label="LocalPro.lt pagrindinis puslapis"><LocalProPreviewBrand /></Link><Link href="/#results">← Meistrų paieška</Link></nav>
    <article className="public-profile-card">
      <header className="public-profile-header"><p className="eyebrow">LocalPro meistro profilis</p><h1>{profile.companyName || profile.name} – {profile.trade} {profile.town}</h1>{profile.companyName ? <p>{profile.name}</p> : null}<PublicProfileGallery name={profile.name} trade={profile.trade} photoUrls={profile.photoUrls ?? []} /></header>
      <section className="public-profile-grid"><div className="public-profile-main">
        <section><h2>Apie meistrą</h2><p>{profile.description}</p></section>
        <section><h2>Paslaugos</h2><ul>{(profile.subcategoryNames || []).map((service) => <li key={service}>{service}</li>)}</ul></section>
        <section><h2>Aptarnaujama teritorija</h2><p>{profile.operatingCities.join(", ")} · iki {profile.radius} km</p></section>
        {profile.verification.length ? <section><h2>Patvirtinta informacija</h2><p>{formatVerificationSummary(profile.verification)}</p></section> : null}
        {profile.reviews.length ? <section><h2>Atsiliepimai</h2>{profile.reviews.map(([author, rating, text], index) => <blockquote key={`${author}-${index}`}><strong>{author} · {rating}/5</strong><p>{text}</p></blockquote>)}</section> : null}
      </div><aside className="public-profile-actions" aria-label="Susisiekti"><a className="primary-action" href={`tel:${profile.phone.replaceAll(" ", "")}`}>Skambinti</a>{whatsapp ? <a className="secondary-action" href={`https://wa.me/${whatsapp}`} rel="noreferrer">WhatsApp</a> : null}<ProfileReportForm profileId={profile.id} /></aside></section>
      {landingLinks.length ? <nav aria-label="Paslaugos ir vietovės"><h2>Raskite panašius meistrus</h2><ul>{landingLinks.map(({ city, path }) => <li key={`${city}-${path}`}><Link href={path!}>{profile.trade} – {city}</Link></li>)}</ul></nav> : null}
    </article>
  </main>;
}

async function getProfile(slug: string) {
  const storedProfile = await getPublicSpecialistBySeoSlug(slug).catch(() => null);
  if (storedProfile) return storedProfile;
  if (process.env.NODE_ENV === "production" && process.env.LOCALPRO_SEED_MODE !== "true") return null;
  return seedSpecialists.find((specialist) => specialist.status === "approved" && profileSeoSlug(specialist) === slug) ?? null;
}
