import { categories, specialists as seedSpecialists } from "./seed-data";
import { isObviousPublicTestProfile } from "./display";
import { profileRowToSpecialist, type ProfileRow } from "./db-mappers";
import { approximatePublicCoordinates, cityCoordinates, distanceKm, isNationwideTravelRange } from "./geo";
import { createServerSupabase } from "./supabase";
import type { Specialist } from "./types";

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
  description,
  review_score,
  review_count,
  verification_labels,
  public_status,
  approval_status,
  is_demo,
  source,
  service_area_label,
  service_categories!tradesperson_profiles_service_category_id_fkey(name, slug),
  profile_services(service_categories(name, slug), service_subcategories(name, slug)),
  operating_areas(city, radius_km),
  profile_photos(id, label, url, moderation_status, sort_order),
  reviews(client_name, rating, text, moderation_status)
`;

export async function getCategories() {
  const supabase = createServerSupabase();

  if (!supabase) {
    return categories;
  }

  const { data, error } = await supabase
    .from("service_categories")
    .select("id,name,slug,service_subcategories(id,name,slug)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data?.length) {
    return categories;
  }

  return data.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    subcategories: category.service_subcategories ?? []
  }));
}

export async function getSpecialists(filters: SpecialistFilters = {}) {
  const supabase = createServerSupabase();

  if (!supabase) {
    return filterSeedSpecialists(filters);
  }

  const { data, error } = await runSpecialistQuery(SPECIALIST_SELECT, filters);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as ProfileRow[];
  return toPublicSpecialistList(applyFilters(removePublicTestProfiles(rows.map((row) => profileRowToSpecialist(row)), filters), filters));
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
  }

  return query.order("created_at", { ascending: false });
}

export async function getSpecialist(id: string) {
  const list = await getSpecialists();
  return list.find((specialist) => specialist.id === id) ?? null;
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

function applyFilters(list: Specialist[], filters: SpecialistFilters) {
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
      specialist.subcategorySlugs.includes(service);
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
  });
}

function getSearchPoint(filters: SpecialistFilters) {
  if (typeof filters.lat === "number" && typeof filters.lng === "number") {
    return { lat: filters.lat, lng: filters.lng };
  }

  return cityCoordinates(filters.location || filters.city);
}

function toPrivacySafeSeedSpecialist(specialist: Specialist) {
  const publicCoordinates = approximatePublicCoordinates(specialist.id, { lat: specialist.lat, lng: specialist.lng });

  return {
    ...specialist,
    lat: publicCoordinates.lat,
    lng: publicCoordinates.lng,
    registeredLat: specialist.lat,
    registeredLng: specialist.lng,
    isAvailableSoon: specialist.isAvailableSoon ?? ["jonas", "darius", "asta"].includes(specialist.id),
    approximateLocation: specialist.approximateLocation ?? specialist.town,
    streetArea: specialist.streetArea ?? undefined
  };
}

function toPublicSpecialistList(list: Specialist[]) {
  return list.map((item) => {
    const specialist = { ...item };
    delete specialist.registeredLat;
    delete specialist.registeredLng;
    delete specialist.streetArea;
    return specialist;
  });
}
