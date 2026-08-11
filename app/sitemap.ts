import type { MetadataRoute } from "next";
import { getSeoSpecialists } from "../lib/specialists";
import { categoryLocationPath, isSeoEligible, profilePath, SITE_URL } from "../lib/seo";

export function buildSeoSitemapEntries(profiles: Awaited<ReturnType<typeof getSeoSpecialists>>): MetadataRoute.Sitemap {
  const eligibleProfiles = profiles.filter(isSeoEligible);
  const profileEntries = eligibleProfiles.map((profile) => ({ url: `${SITE_URL}${profilePath(profile)}`, changeFrequency: "weekly" as const, priority: 0.8 }));
  const landingPaths = Array.from(new Set(eligibleProfiles.flatMap((profile) => profile.operatingCities.map((city) => categoryLocationPath(profile, city))).filter((path): path is string => Boolean(path))));
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    ...landingPaths.map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: "daily" as const, priority: 0.9 })),
    ...profileEntries,
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 }
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return [];
  return buildSeoSitemapEntries(await getSeoSpecialists());
}
