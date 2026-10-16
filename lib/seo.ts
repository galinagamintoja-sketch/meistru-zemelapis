import type { Metadata } from "next";
import { isObviousPublicTestProfile } from "./display";
import type { Specialist } from "./types";
import { canonicalCategorySlug } from "./service-taxonomy";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://localpro.lt").replace(/\/$/, "");

export const SOCIAL_IMAGE_ALT = "LocalPro.lt logotipas, užrašas „Reikia meistro? Rask šalia.“ ir iliustruotas žemėlapis su meistrų paslaugų žymekliais.";
export const PROFILE_SOCIAL_IMAGE = {
  url: `${SITE_URL}/brand/localpro-social-v1.png`, width: 1200, height: 630,
  type: "image/png", alt: SOCIAL_IMAGE_ALT
} as const;
export const CATEGORY_SOCIAL_IMAGE = PROFILE_SOCIAL_IMAGE;

export const HOME_METADATA: Metadata = {
  title: "Meistrai jūsų mieste – raskite specialistą | LocalPro.lt",
  description: "Ieškote meistro? LocalPro.lt raskite elektrikus, santechnikus ir apdailos specialistus savo mieste. Peržiūrėkite profilius ir susisiekite tiesiogiai.",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "Reikia meistro? Rask šalia. | LocalPro.lt",
    description: "Atrask elektrikus, santechnikus ir apdailos specialistus savo mieste. Rask meistrą su LocalPro.lt.",
    type: "website", siteName: "LocalPro.lt", locale: "lt_LT", url: SITE_URL,
    images: [PROFILE_SOCIAL_IMAGE]
  },
  twitter: {
    card: "summary_large_image",
    title: "Reikia meistro? Rask šalia. | LocalPro.lt",
    description: "Atrask elektrikus, santechnikus ir apdailos specialistus savo mieste. Rask meistrą su LocalPro.lt.",
    images: [{ url: PROFILE_SOCIAL_IMAGE.url, alt: SOCIAL_IMAGE_ALT }]
  }
};

const professionSeo: Record<string, { slug: string; plural: string; singular: string; searchName: string }> = {
  apdaila: { slug: "dazytojai", plural: "Dažytojai", singular: "Dažytojas", searchName: "Vidaus apdaila" },
  "staliaus-darbai": { slug: "staliai", plural: "Staliai", singular: "Stalius", searchName: "Medžio darbai ir baldai" },
  santechnika: { slug: "santechnikai", plural: "Santechnikai", singular: "Santechnikas", searchName: "Santechnika" },
  elektra: { slug: "elektrikai", plural: "Elektrikai", singular: "Elektrikas", searchName: "Elektra ir apsaugos sistemos" },
  stogai: { slug: "stogdengiai", plural: "Stogdengiai", singular: "Stogdengys", searchName: "Stogai ir skardinimas" },
  "trinkeles-ir-aplinka": { slug: "trinkeliu-klojejai", plural: "Trinkelių klojėjai", singular: "Trinkelių klojėjas", searchName: "Lauko ir sklypo darbai" },
  "pilna-renovacija": { slug: "renovacijos-meistrai", plural: "Renovacijos meistrai", singular: "Renovacijos meistras", searchName: "Vidaus apdaila" }
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
  const profession = professionByCategorySlug(profile.categorySlug)?.singular || profile.trade || "meistras";
  return `${slugify(profile.companyName || profile.name)}-${slugify(profession)}-${slugify(profile.town)}-${stableSuffix(profile.id)}`;
}

export function profilePath(profile: Specialist) {
  return `/meistrai/${profileSeoSlug(profile)}`;
}

export function professionByLandingSlug(slug: string) {
  return Object.entries(professionSeo).find(([, value]) => value.slug === slug);
}

export function legacyProfileSeoSlug(profile: Specialist) {
  return `${slugify(profile.companyName || profile.name)}-${slugify(profile.trade || "meistras")}-${slugify(profile.town)}-${stableSuffix(profile.id)}`;
}

function professionByCategorySlug(categorySlug: string) {
  const canonical = canonicalCategorySlug(categorySlug);
  return Object.entries(professionSeo).find(([legacySlug]) => canonicalCategorySlug(legacySlug) === canonical)?.[1];
}

export function categorySearchReturnPath(professionSlug: string, city: string) {
  const searchName = professionByLandingSlug(professionSlug)?.[1].searchName;
  const query = new URLSearchParams({ ...(searchName ? { service: searchName } : {}), locality: city });
  return `/?${query.toString()}#results`;
}

export function categoryLocationPath(profile: Specialist, city: string) {
  const profession = professionByCategorySlug(profile.categorySlug);
  return profession ? `/${profession.slug}/${slugify(city)}` : null;
}

export function matchesCategoryLocation(profile: Specialist, professionSlug: string, locationSlug: string) {
  const entry = professionByLandingSlug(professionSlug);
  return Boolean(entry && isSeoEligible(profile) && canonicalCategorySlug(profile.categorySlug) === canonicalCategorySlug(entry[0]) &&
    profile.operatingCities.some((city) => slugify(city) === locationSlug));
}

export function locationLocative(city: string) {
  const slug = slugify(city);
  return locationForms[slug] || city;
}

export function profileMetadata(profile: Specialist): Metadata {
  const name = profile.companyName || profile.name;
  const profession = professionByCategorySlug(profile.categorySlug)?.singular || profile.trade;
  const place = locationLocative(profile.town);
  const canonical = `${SITE_URL}${profilePath(profile)}`;
  const services = (profile.subcategoryNames?.length ? profile.subcategoryNames : profile.subcategorySlugs).slice(0, 3).join(", ");
  const title = `${name} – ${profession} ${place} | LocalPro`;
  const description = `${name} teikia ${services} paslaugas ${place}. Peržiūrėkite darbus, aptarnaujamą teritoriją ir profilį LocalPro.`.slice(0, 160);
  const socialDescription = profile.description.slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { title, description: socialDescription, url: canonical, type: "profile", siteName: "LocalPro.lt", locale: "lt_LT", images: [PROFILE_SOCIAL_IMAGE] },
    twitter: { card: "summary_large_image", title, description: socialDescription, images: [{ url: PROFILE_SOCIAL_IMAGE.url, alt: SOCIAL_IMAGE_ALT }] }
  };
}

export function categoryMetadata(professionSlug: string, city: string, count: number): Metadata {
  const entry = professionByLandingSlug(professionSlug);
  if (!entry || count < 1) return { robots: { index: false, follow: true } };
  const [, profession] = entry;
  const place = locationLocative(city);
  const canonical = `${SITE_URL}/${professionSlug}/${slugify(city)}`;
  const title = `${profession.plural} ${place} – patikimi meistrai | LocalPro`;
  const description = `Raskite ${profession.plural.toLowerCase()} ${place}. Peržiūrėkite LocalPro meistrų profilius, paslaugas, darbų nuotraukas ir aptarnaujamas teritorijas.`;
  return {
    title,
    description,
    alternates: { canonical }, robots: { index: true, follow: true },
    openGraph: { title, description, url: canonical, type: "website", siteName: "LocalPro.lt", locale: "lt_LT", images: [CATEGORY_SOCIAL_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: CATEGORY_SOCIAL_IMAGE.url, alt: SOCIAL_IMAGE_ALT }] }
  };
}

/** Publication gates also apply if this helper is called outside the page loader. */
export function isPublicProfile(profile: Specialist) {
  return profile.status === "approved" && profile.publicStatus === "public" && !profile.isDemo &&
    Boolean(profile.publicContactConsentAt) && !isObviousPublicTestProfile(profile);
}

function publicImageUrl(value: string) {
  try {
    const url = new URL(value, SITE_URL);
    // Only this first-party route enforces photo/profile approval and consent on every request.
    // An arbitrary external URL may be a private capability even without familiar token names.
    if (url.origin !== new URL(SITE_URL).origin || url.username || url.password || url.search || url.hash ||
        !/^\/api\/public\/profile-photos\/[0-9a-f-]{36}$/i.test(url.pathname)) return null;
    return url.toString();
  } catch { return null; }
}

export function profileJsonLd(profile: Specialist) {
  if (!isPublicProfile(profile)) return null;
  const url = `${SITE_URL}${profilePath(profile)}`;
  const entityId = `${url}#specialist`;
  const proof = profile.verifiedBusiness;
  const isBusiness = Boolean(proof && proof.name.trim() && proof.name.trim() === profile.companyName?.trim() &&
    Number.isFinite(Date.parse(proof.verifiedAt)) && Date.parse(proof.verifiedAt) <= Date.now());
  const name = isBusiness ? proof!.name.trim() : profile.name.trim();
  if (!name) return null;
  // These are public service labels, not inferred qualifications or internal slugs.
  const services = Array.from(new Set((profile.subcategoryNames ?? []).map((name) => name.trim()).filter(Boolean)));
  // Operating-area text may describe a district or village, not necessarily a City or an address.
  const areas = Array.from(new Set(profile.operatingCities.map((name) => name.trim()).filter(Boolean)))
    .map((name) => ({ "@type": "Place", name }));
  const entity: Record<string, unknown> = {
    "@type": isBusiness ? "Organization" : "Person", "@id": entityId,
    name, url, description: profile.description, mainEntityOfPage: { "@id": url }
  };
  // A service category is not a verified personal job title; do not emit jobTitle.
  if (services.length) {
    entity.knowsAbout = services;
    entity.makesOffer = services.map((name) => ({
      "@type": "Offer", itemOffered: {
        "@type": "Service", name, serviceType: name, provider: { "@id": entityId },
        ...(profile.trade.trim() ? { category: profile.trade } : {}),
        ...(areas.length ? { areaServed: areas } : {})
      }
    }));
  }
  if (isBusiness && areas.length) entity.areaServed = areas;
  const images = Array.from(new Set((profile.photoUrls ?? []).map(publicImageUrl).filter((url): url is string => Boolean(url))));
  if (images.length) entity.image = images;
  return {
    "@context": "https://schema.org", "@type": "ProfilePage", "@id": url, url,
    name: `${profile.companyName || profile.name} – ${profile.trade} ${profile.town}`,
    mainEntity: entity
  };
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
