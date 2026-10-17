import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import LocalProPreviewBrand from "../../../components/LocalProPreviewBrand";
import PublicProfileGallery from "../../../components/PublicProfileGallery";
import { ProfileReportForm } from "../../../components/profile-report-form";
import { formatVerificationSummary } from "../../../lib/display";
import { getPublicSpecialistBySeoSlug } from "../../../lib/specialists";
import { isPublicProfile, isSeoEligible, profileBreadcrumbJsonLd, profileHeading, profileJsonLd, profileLandingLinks, profileMetadata, publicProfileCategories, profilePath, profileSeoSlug, publicProfileName, safeJsonLd } from "../../../lib/seo";
import { specialists as seedSpecialists } from "../../../lib/seed-data";

type PageProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ return?: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const profile = await getProfile((await params).slug);
  if (!profile) return { title: "Meistras nerastas | LocalPro", robots: { index: false, follow: false } };
  const metadata = profileMetadata(profile);
  return isSeoEligible(profile) ? metadata : { ...metadata, robots: { index: false, follow: true } };
}

export default async function PublicTradespersonPage({ params, searchParams }: PageProps) {
  const profile = await getProfile((await params).slug);
  if (!profile) notFound();
  if ((await params).slug !== profilePath(profile).split("/").pop()) permanentRedirect(profilePath(profile));
  const jsonLd = profileJsonLd(profile) ?? profileBreadcrumbJsonLd(profile);
  const breadcrumbs = profileBreadcrumbJsonLd(profile);
  const whatsapp = profile.whatsapp.replace(/[^\d]/g, "");
  const landingLinks = profileLandingLinks(profile);
  const categories = publicProfileCategories(profile);
  const requestedReturn = (await searchParams).return;
  const returnPath = requestedReturn?.startsWith("/") && !requestedReturn.startsWith("//") ? requestedReturn : "/#results";
  return <main className="public-profile-shell">
    {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} /> : null}
    <nav className="public-profile-nav" aria-label="Profilio navigacija"><Link className="public-profile-brand" href="/" aria-label="LocalPro.lt pagrindinis puslapis"><LocalProPreviewBrand /></Link><Link href={returnPath}>← Meistrų paieška</Link></nav>
    {breadcrumbs ? <nav className="public-profile-breadcrumb" aria-label="Naršymo kelias"><ol role="list">{breadcrumbs.itemListElement.map((item, index) => <li key={item.item}>
      {index ? <span aria-hidden="true">/</span> : null}
      {index === breadcrumbs.itemListElement.length - 1 ? <span aria-current="page">{item.name}</span> : <Link href={item.item}>{item.name}</Link>}
    </li>)}</ol></nav> : null}
    <article className="public-profile-card">
      <header className="public-profile-header"><p className="eyebrow">LocalPro meistro profilis</p><h1>{profileHeading(profile)}</h1>{profile.companyName ? <p>{profile.name}</p> : null}<PublicProfileGallery name={publicProfileName(profile)} trade={profile.trade} categorySlug={profile.categorySlug} photoUrls={profile.photoUrls ?? []} photoLabels={profile.photoLabels} /></header>
      <section className="public-profile-grid"><div className="public-profile-main">
        <section><h2>Apie meistrą</h2><p>{profile.description}</p></section>
        {categories.length > 1 ? <section><h2>Kategorijos</h2><p>{categories.join(" · ")}</p></section> : null}
        <section><h2>Paslaugos</h2><ul>{(profile.subcategoryNames || []).map((service) => <li key={service}>{service}</li>)}</ul></section>
        {profile.labourRateUnit ? <section><h2>Darbo kainos</h2>
          {profile.labourRateUnit === "hour" ? <p><strong>nuo €{profile.labourRateAmount}/val.</strong></p> : null}
          {profile.labourRateUnit === "sqm" ? profile.serviceLabourRates?.map((rate) => <p key={rate.serviceSlug}><strong>{rate.serviceName} — nuo {rate.amount} €/m²</strong></p>) : null}
          {profile.labourRateUnit === "agreed" ? <p><strong>Sutartinė / už visą darbą</strong></p> : null}
          <p className="privacy-note">Nurodyta orientacinė darbo kaina. Medžiagos neįskaičiuotos. Galutinė kaina gali priklausyti nuo darbų kiekio, sudėtingumo ir objekto būklės.</p>
        </section> : null}
        <section><h2>Aptarnaujama teritorija</h2><p>{profile.operatingCities.join(", ")} · iki {profile.radius} km</p></section>
        {profile.verification.length ? <section><h2>Patvirtinta informacija</h2><p>{formatVerificationSummary(profile.verification)}</p></section> : null}
        {profile.reviews.length ? <section><h2>Atsiliepimai</h2>{profile.reviews.map(([author, rating, text], index) => <blockquote key={`${author}-${index}`}><strong>{author} · {rating}/5</strong><p>{text}</p></blockquote>)}</section> : null}
      </div><aside className="public-profile-actions" aria-label="Susisiekti"><a className="primary-action" href={`tel:${profile.phone.replaceAll(" ", "")}`}>Skambinti</a>{whatsapp ? <a className="secondary-action" href={`https://wa.me/${whatsapp}`} rel="noreferrer">WhatsApp</a> : null}<ProfileReportForm profileId={profile.id} /></aside></section>
      {landingLinks.length ? <nav aria-label="Paslaugos ir vietovės"><h2>Raskite panašius meistrus</h2><ul>{landingLinks.map(({ name, path }) => <li key={path}><Link href={path}>{name}</Link></li>)}</ul></nav> : null}
    </article>
  </main>;
}

async function getProfile(slug: string) {
  const storedProfile = await getPublicSpecialistBySeoSlug(slug).catch(() => null);
  if (storedProfile) return isPublicProfile(storedProfile) ? storedProfile : null;
  if (process.env.NODE_ENV === "production" && process.env.LOCALPRO_SEED_MODE !== "true") return null;
  return seedSpecialists.find((specialist) => isPublicProfile(specialist) && profileSeoSlug(specialist) === slug) ?? null;
}
