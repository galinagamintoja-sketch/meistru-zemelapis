import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeoProfileCard } from "../../../components/seo-profile-card";
import { getSeoSpecialists } from "../../../lib/specialists";
import { categoryJsonLd, categoryMetadata, locationLocative, matchesCategoryLocation, professionByLandingSlug, safeJsonLd, slugify } from "../../../lib/seo";

type PageProps = { params: Promise<{ profession: string; location: string }> };

async function matching(profession: string, location: string) {
  const entry = professionByLandingSlug(profession);
  if (!entry) return [];
  return (await getSeoSpecialists()).filter((profile) => matchesCategoryLocation(profile, profession, location));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { profession, location } = await params;
  const profiles = await matching(profession, location);
  const city = profiles.find(Boolean)?.operatingCities.find((item) => slugify(item) === location) || location;
  return categoryMetadata(profession, city, profiles.length);
}

export default async function CategoryLocationPage({ params }: PageProps) {
  const { profession, location } = await params;
  const entry = professionByLandingSlug(profession);
  const profiles = await matching(profession, location);
  if (!entry || !profiles.length) notFound();
  const city = profiles[0].operatingCities.find((item) => slugify(item) === location) || location;
  const heading = `${entry[1].plural} ${locationLocative(city)}`;
  return <main className="public-profile-shell">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(categoryJsonLd(profession, city, profiles)) }} />
    <nav className="public-profile-nav"><Link className="brand" href="/">LocalPro</Link><Link href="/#mapSection">Meistrų paieška</Link></nav>
    <header className="public-profile-card"><h1>{heading}</h1><p>Raskite patikimus meistrus {locationLocative(city)}. Peržiūrėkite profilius, paslaugas, darbų nuotraukas ir aptarnaujamas teritorijas.</p></header>
    <section aria-label={heading}>{profiles.map((profile) => <SeoProfileCard key={profile.id} profile={profile} />)}</section>
  </main>;
}
