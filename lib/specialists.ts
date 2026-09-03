import { categories, specialists as seedSpecialists } from "./seed-data";
import { isObviousPublicTestProfile } from "./display";
import { profileRowToSpecialist, toPublicSafeSpecialist, type ProfileRow } from "./db-mappers";
import { cityCoordinates, distanceKm, isNationwideTravelRange } from "./geo";
import { createServerSupabase } from "./supabase";
import { canonicalServiceSlug, categoriesFromAssignments, categoriesFromLegacy } from "./service-taxonomy";
import type { Specialist } from "./types";
import { isSeoEligible, profileSeoSlug } from "./seo";

type SpecialistFilters = {
  service?: string | null;
  city?: string | null;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  customerRadiusKm?: number | null;
  verification?: string | null;
  verifiedOnly?: boolean;
  availableSoon?: boolean;
  minRating?: number | null;
  includePending?: boolean;
};

const SPECIALIST_SELECT = `
  id,
  display_name,
  company_name,
  phone,
  whatsapp_number,
  email,
  base_city,
  radius_km,
  latitude,
  longitude,
  public_latitude,
  public_longitude,
  description,
  review_score,
  review_count,
  verification_labels,
  public_status,
  approval_status,
  is_demo,
  public_contact_consent_at,
  source,
  service_area_label,
  service_categories!tradesperson_profiles_service_category_id_fkey(name, slug),
  profile_category_assignments(service_categories(name, slug)),
  profile_services(service_categories(name, slug), service_subcategories(name, slug)),
  operating_areas(city, radius_km),
  profile_photos(id, label, url, storage_path, moderation_status, sort_order, removed_from_profile_at),
  reviews(client_name, rating, text, moderation_status)
`;
const LEGACY_SPECIALIST_SELECT = SPECIALIST_SELECT.replace("  profile_category_assignments(service_categories(name, slug)),\n", "");
const PRE_APPROXIMATE_LOCATION_SELECT = SPECIALIST_SELECT
  .replace("  public_latitude,\n", "")
  .replace("  public_longitude,\n", "");
const LEGACY_PRE_APPROXIMATE_LOCATION_SELECT = LEGACY_SPECIALIST_SELECT
  .replace("  public_latitude,\n", "")
  .replace("  public_longitude,\n", "");

export async function getCategories() {
  const supabase = createServerSupabase();

  if (!supabase) {
    return categories;
  }

  const assignmentResult = await supabase
    .from("service_categories")
    .select("id,name,slug,service_category_assignments(service_subcategories(id,name,slug,is_active))")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (!assignmentResult.error && assignmentResult.data?.length) {
    return categoriesFromAssignments(assignmentResult.data);
  }

  const { data, error } = await supabase
    .from("service_categories")
    .select("id,name,slug,service_subcategories!service_subcategories_service_category_id_fkey(id,name,slug,is_active)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.length) {
    return [];
  }

  return categoriesFromLegacy(data);
}

export async function getSpecialists(filters: SpecialistFilters = {}) {
  const hasDatabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!hasDatabaseConfig && process.env.NODE_ENV === "production" && process.env.LOCALPRO_SEED_MODE !== "true") {
    return [];
  }
  const supabase = createServerSupabase();

  if (!supabase) {
    return filterSeedSpecialists(filters);
  }

  let { data, error } = await runSpecialistQuery(SPECIALIST_SELECT, filters);
  let usedPreApproximateLocationSelect = false;
  if (error && /public_latitude|public_longitude/i.test(error.message)) {
    usedPreApproximateLocationSelect = true;
    ({ data, error } = await runSpecialistQuery(PRE_APPROXIMATE_LOCATION_SELECT, filters));
  }
  if (error && /profile_category_assignments/i.test(error.message)) {
    const select = usedPreApproximateLocationSelect
      ? LEGACY_PRE_APPROXIMATE_LOCATION_SELECT
      : LEGACY_SPECIALIST_SELECT;
    ({ data, error } = await runSpecialistQuery(select, filters));
  }

  if (error) {
    if (isMissingPhase1MigrationError(error.message)) {
      return [];
    }

    throw new Error(error.message);
  }

  const rows = await signManagedPhotoUrls((data ?? []) as unknown as ProfileRow[], false);
  return toPublicSpecialistList(applyFilters(removePublicTestProfiles(rows.map((row) => profileRowToSpecialist(row)), filters), filters));
}

export async function signManagedPhotoUrls(rows: ProfileRow[], includeUnapproved: boolean) {
  const supabase = createServerSupabase();
  if (!supabase) return rows;

  await Promise.all(rows.flatMap((row) => (row.profile_photos ?? []).map(async (photo) => {
    if (!photo.storage_path) return;
    // A managed photo's database URL may contain a legacy public-bucket URL.
    // Never return it when the object lives in private storage, even if signing fails.
    photo.url = null;
    if (!includeUnapproved && photo.moderation_status !== "approved") return;
    const { data, error } = await supabase.storage.from("profile-photos").createSignedUrl(photo.storage_path, 600);
    if (!error) photo.url = data.signedUrl;
  })));
  return rows;
}

function runSpecialistQuery(select: string, filters: SpecialistFilters) {
  const supabase = createServerSupabase();

  if (!supabase) {
    return Promise.resolve({ data: null, error: new Error("Supabase is not configured") });
  }

  let query = supabase.from("tradesperson_profiles").select(select).eq("public_status", "public");

  if (!filters.includePending) {
    query = query.eq("approval_status", "approved");
    query = query.eq("is_demo", false);
    query = query.not("public_contact_consent_at", "is", null);
  }

  return query.order("created_at", { ascending: false });
}

export async function getSpecialist(id: string) {
  const list = await getSpecialists();
  const requested = decodeURIComponent(id).toLowerCase();
  return list.find((specialist) => specialist.id.toLowerCase() === requested || specialistSlug(specialist) === requested) ?? null;
}

export async function getSeoSpecialists() {
  return (await getSpecialists()).filter(isSeoEligible);
}

export async function getSeoSpecialist(slug: string) {
  const requested = decodeURIComponent(slug).toLowerCase();
  return (await getSeoSpecialists()).find((specialist) => profileSeoSlug(specialist) === requested) ?? null;
}

export function specialistSlug(specialist: Pick<Specialist, "id" | "name">) {
  const name = specialist.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${name || "specialistas"}-${specialist.id}`;
}

function filterSeedSpecialists(filters: SpecialistFilters) {
  const publicList = seedSpecialists.filter((specialist) =>
    filters.includePending ? true : specialist.status === "approved"
  );

  return toPublicSpecialistList(applyFilters(removePublicTestProfiles(publicList.map(toPrivacySafeSeedSpecialist), filters), filters));
}

function removePublicTestProfiles(list: Specialist[], filters: SpecialistFilters) {
  if (filters.includePending) {
    return list;
  }

  return list.filter((specialist) => !isObviousPublicTestProfile(specialist));
}

export function applyFilters(list: Specialist[], filters: SpecialistFilters) {
  const searchPoint = getSearchPoint(filters);
  const customerRadiusKm = filters.customerRadiusKm && filters.customerRadiusKm > 0 ? filters.customerRadiusKm : null;

  return list.filter((specialist) => {
    const service = filters.service && filters.service !== "all" ? filters.service : null;
    const city = filters.city && filters.city !== "all" ? filters.city : null;
    const verification = filters.verification && filters.verification !== "all" ? filters.verification : null;
    const registeredPoint = { lat: specialist.registeredLat ?? specialist.lat, lng: specialist.registeredLng ?? specialist.lng };

    const serviceMatch =
      !service ||
      specialist.trade === service ||
      specialist.categorySlug === service ||
      specialist.categorySlugs?.includes(service) ||
      specialist.subcategorySlugs.includes(canonicalServiceSlug(service) ?? service);
    const cityMatch = !city || specialist.town === city || specialist.operatingCities.includes(city);
    const verificationMatch = !verification || specialist.verification.includes(verification);
    const verifiedMatch = !filters.verifiedOnly || specialist.verification.length > 0;
    const availableMatch = !filters.availableSoon || specialist.isAvailableSoon || specialist.verification.includes("available-soon");
    const ratingMatch = !filters.minRating || specialist.rating >= filters.minRating;
    const profileInsideCustomerRadius =
      !searchPoint || !customerRadiusKm || distanceKm(searchPoint, registeredPoint) <= customerRadiusKm;
    const customerInsideTravelRange =
      !searchPoint || isNationwideTravelRange(specialist.radius) || distanceKm(searchPoint, registeredPoint) <= specialist.radius;

    return (
      serviceMatch &&
      cityMatch &&
      verificationMatch &&
      verifiedMatch &&
      availableMatch &&
      ratingMatch &&
      profileInsideCustomerRadius &&
      customerInsideTravelRange
    );
  }).map((specialist) => {
    if (!searchPoint) {
      return specialist;
    }

    return {
      ...specialist,
      distanceKm: distanceKm(searchPoint, { lat: specialist.registeredLat ?? specialist.lat, lng: specialist.registeredLng ?? specialist.lng })
    };
  }).sort(rankSpecialists);
}

export function rankSpecialists(left: Specialist, right: Specialist) {
  const ratingOrder = right.rating - left.rating;
  if (ratingOrder) return ratingOrder;

  const reviewOrder = right.reviewCount - left.reviewCount;
  if (reviewOrder) return reviewOrder;

  const distanceOrder = (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY);
  if (distanceOrder) return distanceOrder;

  return left.name.localeCompare(right.name, "lt") || left.id.localeCompare(right.id);
}

function getSearchPoint(filters: SpecialistFilters) {
  if (typeof filters.lat === "number" && typeof filters.lng === "number") {
    return { lat: filters.lat, lng: filters.lng };
  }

  return cityCoordinates(filters.location || filters.city);
}

function toPrivacySafeSeedSpecialist(specialist: Specialist) {
  return {
    ...specialist,
    lat: specialist.lat,
    lng: specialist.lng,
    registeredLat: specialist.lat,
    registeredLng: specialist.lng,
    isAvailableSoon: specialist.isAvailableSoon ?? ["jonas", "darius", "asta"].includes(specialist.id),
    approximateLocation: specialist.approximateLocation ?? specialist.town,
    streetArea: specialist.streetArea ?? undefined
  };
}

function toPublicSpecialistList(list: Specialist[]) {
  return list.map(toPublicSafeSpecialist);
}

function isMissingPhase1MigrationError(message: string) {
  return /public_contact_consent_at|is_demo|removed_from_profile_at/i.test(message) && /does not exist|schema cache/i.test(message);
}
