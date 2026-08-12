import Link from "next/link";
import type { Specialist } from "../lib/types";
import { profilePath } from "../lib/seo";

export function SeoProfileCard({ profile }: { profile: Specialist }) {
  return <article className="public-profile-card">
    <h2><Link href={profilePath(profile)}>{profile.companyName || profile.name}</Link></h2>
    <p>{profile.trade} · {profile.operatingCities.join(", ")}</p>
    <p>{profile.description}</p>
    {profile.subcategoryNames?.length ? <p>{profile.subcategoryNames.join(" · ")}</p> : null}
    <Link className="primary-action" href={profilePath(profile)}>Peržiūrėti profilį</Link>
  </article>;
}
