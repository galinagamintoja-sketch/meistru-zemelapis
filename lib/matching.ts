import { cityCoordinates, distanceKm, isNationwideTravelRange } from "./geo";

export type MatchReason =
  | "matched_category_and_service"
  | "matched_category"
  | "excluded_not_public"
  | "excluded_not_approved"
  | "excluded_demo"
  | "excluded_no_public_consent"
  | "excluded_incomplete_profile"
  | "excluded_category_mismatch"
  | "excluded_location_mismatch"
  | "excluded_missing_job_location";

export type MatchJob = {
  categorySlug: string;
  subcategorySlug?: string | null;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type MatchCandidate = {
  id: string;
  display_name: string;
  phone: string;
  whatsapp_number?: string | null;
  email: string;
  base_city: string;
  radius_km: number;
  latitude?: number | null;
  longitude?: number | null;
  public_status: string;
  approval_status: string;
  is_demo?: boolean | null;
  public_contact_consent_at?: string | null;
  verification_labels?: string[] | null;
  service_categories?: { slug: string } | Array<{ slug: string }> | null;
  profile_services?: Array<{
    service_categories?: { slug: string } | Array<{ slug: string }> | null;
    service_subcategories?: { slug: string } | Array<{ slug: string }> | null;
  }>;
  operating_areas?: Array<{ city: string; radius_km?: number | null }>;
};

export type CandidateEvaluation = {
  candidateId: string;
  matched: boolean;
  reason: MatchReason;
  distanceKm: number | null;
  relevance: number;
};

export function evaluateCandidates(job: MatchJob, candidates: MatchCandidate[]) {
  const evaluations = candidates.map((candidate) => evaluateCandidate(job, candidate));
  const matches = evaluations.filter((item) => item.matched).sort((left, right) => {
    if (right.relevance !== left.relevance) return right.relevance - left.relevance;
    const distanceOrder = (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY);
    if (distanceOrder !== 0) return distanceOrder;
    const leftCandidate = candidates.find((candidate) => candidate.id === left.candidateId)!;
    const rightCandidate = candidates.find((candidate) => candidate.id === right.candidateId)!;
    return leftCandidate.display_name.localeCompare(rightCandidate.display_name, "lt") || left.candidateId.localeCompare(right.candidateId);
  });
  return { evaluations, matches };
}

export function evaluateCandidate(job: MatchJob, candidate: MatchCandidate): CandidateEvaluation {
  const excluded = (reason: MatchReason): CandidateEvaluation => ({ candidateId: candidate.id, matched: false, reason, distanceKm: null, relevance: 0 });
  if (candidate.public_status !== "public") return excluded("excluded_not_public");
  if (candidate.approval_status !== "approved") return excluded("excluded_not_approved");
  if (candidate.is_demo) return excluded("excluded_demo");
  if (!candidate.public_contact_consent_at) return excluded("excluded_no_public_consent");
  if (!candidate.id || !candidate.display_name || !candidate.phone || !candidate.email || !candidate.base_city || !candidate.radius_km) return excluded("excluded_incomplete_profile");

  const categorySlugs = new Set<string>();
  const subcategorySlugs = new Set<string>();
  const primary = Array.isArray(candidate.service_categories) ? candidate.service_categories[0] : candidate.service_categories;
  if (primary?.slug) categorySlugs.add(primary.slug);
  for (const service of candidate.profile_services ?? []) {
    const category = Array.isArray(service.service_categories) ? service.service_categories[0] : service.service_categories;
    const subcategory = Array.isArray(service.service_subcategories) ? service.service_subcategories[0] : service.service_subcategories;
    if (category?.slug) categorySlugs.add(category.slug);
    if (subcategory?.slug) subcategorySlugs.add(subcategory.slug);
  }
  if (!categorySlugs.has(job.categorySlug)) return excluded("excluded_category_mismatch");
  if (job.subcategorySlug && !subcategorySlugs.has(job.subcategorySlug)) return excluded("excluded_category_mismatch");

  const jobPoint = typeof job.latitude === "number" && typeof job.longitude === "number"
    ? { lat: job.latitude, lng: job.longitude }
    : cityCoordinates(job.city);
  if (!jobPoint) return excluded("excluded_missing_job_location");
  const profilePoint = typeof candidate.latitude === "number" && typeof candidate.longitude === "number"
    ? { lat: candidate.latitude, lng: candidate.longitude }
    : cityCoordinates(candidate.base_city);
  if (!profilePoint) return excluded("excluded_incomplete_profile");

  const operatingAreas = candidate.operating_areas?.length ? candidate.operating_areas : [{ city: candidate.base_city, radius_km: candidate.radius_km }];
  const distances = operatingAreas.map((area) => {
    const center = cityCoordinates(area.city) ?? (area.city === candidate.base_city ? profilePoint : null);
    return center ? { distance: distanceKm(jobPoint, center), radius: area.radius_km ?? candidate.radius_km } : null;
  }).filter((value): value is { distance: number; radius: number } => Boolean(value));
  const nearest = distances.sort((a, b) => a.distance - b.distance)[0];
  if (!isNationwideTravelRange(candidate.radius_km) && (!nearest || nearest.distance > nearest.radius)) return excluded("excluded_location_mismatch");

  const serviceSpecificity = job.subcategorySlug ? 2 : 1;
  const availabilityBonus = candidate.verification_labels?.includes("available-soon") ? 1 : 0;
  return {
    candidateId: candidate.id,
    matched: true,
    reason: job.subcategorySlug ? "matched_category_and_service" : "matched_category",
    distanceKm: nearest?.distance ?? 0,
    relevance: serviceSpecificity + availabilityBonus
  };
}

// Stable ordering: relevance descending, distance ascending, Lithuanian display name, then profile id.
