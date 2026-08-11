import type { Metadata } from "next";
import { isObviousPublicTestProfile } from "./display";
import type { Specialist } from "./types";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://localpro.lt").replace(/\/$/, "");

const professionSeo: Record<string, { slug: string; plural: string; singular: string }> = {
  apdaila: { slug: "dazytojai", plural: "Dažytojai", singular: "Dažytojas" },
  "staliaus-darbai": { slug: "staliai", plural: "Staliai", singular: "Stalius" },
  santechnika: { slug: "santechnikai", plural: "Santechnikai", singular: "Santechnikas" },
  elektra: { slug: "elektrikai", plural: "Elektrikai", singular: "Elektrikas" },
  stogai: { slug: "stogdengiai", plural: "Stogdengiai", singular: "Stogdengys" },
  "trinkeles-ir-aplinka": { slug: "trinkeliu-klojejai", plural: "Trinkelių klojėjai", singular: "Trinkelių klojėjas" },
  "pilna-renovacija": { slug: "renovacijos-meistrai", plural: "Renovacijos meistrai", singular: "Renovacijos meistras" }
};

const locationForms: Record<string, string> = {
  vilnius: "Vilniuje", kaunas: "Kaune", klaipeda: "Klaipėdoje", siauliai: "Šiauliuose",
  panevezys: "Panevėžyje", alytus: "Alytuje", utena: "Utenoje", lentvaris: "Lentvaryje",
  trakai: "Trakuose", marijampole: "Marijampolėje", telsiai: "Telšiuose"
};

export function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function isSeoEligible(profile: Specialist) {
  return profile.status === "approved" && profile.publicStatus === "public" && !profile.isDemo &&
    Boolean(profile.publicContactConsentAt) && !isObviousPublicTestProfile(profile) &&
    Boolean(profile.name.trim() || profile.companyName?.trim()) && Boolean(profile.categorySlug) &&
    profile.operatingCities.some((city) => city.trim().length >= 2) && profile.radius > 0 &&
    profile.subcategorySlugs.length >= 2 && profile.description.trim().length >= 80;
}

function stableSuffix(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

export function profileSeoSlug(profile: Specialist) {
  const profession = professionSeo[profile.categorySlug]?.singular || profile.trade || "meistras";
  return `${slugify(profile.companyName || profile.name)}-${slugify(profession)}-${slugify(profile.town)}-${stableSuffix(profile.id)}`;
}

export function profilePath(profile: Specialist) {
  return `/meistrai/${profileSeoSlug(profile)}`;
}

export function professionByLandingSlug(slug: string) {
  return Object.entries(professionSeo).find(([, value]) => value.slug === slug);
}

export function categoryLocationPath(profile: Specialist, city: string) {
  const profession = professionSeo[profile.categorySlug];
  return profession ? `/${profession.slug}/${slugify(city)}` : null;
}

export function matchesCategoryLocation(profile: Specialist, professionSlug: string, locationSlug: string) {
  const entry = professionByLandingSlug(professionSlug);
  return Boolean(entry && isSeoEligible(profile) && profile.categorySlug === entry[0] &&
    profile.operatingCities.some((city) => slugify(city) === locationSlug));
}

export function locationLocative(city: string) {
  const slug = slugify(city);
  return locationForms[slug] || city;
}

export function profileMetadata(profile: Specialist): Metadata {
  const name = profile.companyName || profile.name;
  const profession = professionSeo[profile.categorySlug]?.singular || profile.trade;
  const place = locationLocative(profile.town);
  const canonical = `${SITE_URL}${profilePath(profile)}`;
  const services = (profile.subcategoryNames?.length ? profile.subcategoryNames : profile.subcategorySlugs).slice(0, 3).join(", ");
  return {
    title: `${name} – ${profession} ${place} | LocalPro`,
    description: `${name} teikia ${services} paslaugas ${place}. Peržiūrėkite darbus, aptarnaujamą teritoriją ir profilį LocalPro.`.slice(0, 160),
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { title: `${name} – ${profession} ${place} | LocalPro`, description: profile.description.slice(0, 160), url: canonical, type: "profile" }
  };
}

export function categoryMetadata(professionSlug: string, city: string, count: number): Metadata {
  const entry = professionByLandingSlug(professionSlug);
  if (!entry || count < 1) return { robots: { index: false, follow: true } };
  const [, profession] = entry;
  const place = locationLocative(city);
  const canonical = `${SITE_URL}/${professionSlug}/${slugify(city)}`;
  return {
    title: `${profession.plural} ${place} – patikimi meistrai | LocalPro`,
    description: `Raskite ${profession.plural.toLowerCase()} ${place}. Peržiūrėkite LocalPro meistrų profilius, paslaugas, darbų nuotraukas ir aptarnaujamas teritorijas.`,
    alternates: { canonical }, robots: { index: true, follow: true }
  };
}

export function profileJsonLd(profile: Specialist) {
  const url = `${SITE_URL}${profilePath(profile)}`;
  const person: Record<string, unknown> = {
    "@type": "Person", name: profile.name,
    jobTitle: professionSeo[profile.categorySlug]?.singular || profile.trade,
    url, description: profile.description,
    areaServed: profile.operatingCities.map((name) => ({ "@type": "City", name })),
    knowsAbout: profile.subcategoryNames?.length ? profile.subcategoryNames : profile.subcategorySlugs
  };
  if (profile.photoUrls?.[0]) person.image = profile.photoUrls[0];
  return { "@context": "https://schema.org", "@type": "ProfilePage", url, mainEntity: person };
}

export function categoryJsonLd(professionSlug: string, city: string, profiles: Specialist[]) {
  const url = `${SITE_URL}/${professionSlug}/${slugify(city)}`;
  return {
    "@context": "https://schema.org", "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "LocalPro", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: `${professionByLandingSlug(professionSlug)?.[1].plural} ${locationLocative(city)}`, item: url }
      ] },
      { "@type": "ItemList", itemListElement: profiles.map((profile, index) => ({
        "@type": "ListItem", position: index + 1, name: profile.companyName || profile.name, url: `${SITE_URL}${profilePath(profile)}`
      })) }
    ]
  };
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
