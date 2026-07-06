import { categories, specialists as seedSpecialists } from "./seed-data";
import { profileRowToSpecialist } from "./db-mappers";
import { createServerSupabase } from "./supabase";
import type { Specialist } from "./types";

type SpecialistFilters = {
  service?: string | null;
  city?: string | null;
  verification?: string | null;
  includePending?: boolean;
};

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

  let query = supabase
    .from("tradesperson_profiles")
    .select(
      `
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
        source,
        service_area_label,
        service_categories(name, slug),
        operating_areas(city, radius_km),
        profile_photos(label, url, sort_order),
        reviews(client_name, rating, text, moderation_status)
      `
    )
    .eq("public_status", "public");

  if (!filters.includePending) {
    query = query.eq("approval_status", "approved");
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return applyFilters((data ?? []).map(profileRowToSpecialist), filters);
}

export async function getSpecialist(id: string) {
  const list = await getSpecialists({ includePending: true });
  return list.find((specialist) => specialist.id === id) ?? null;
}

function filterSeedSpecialists(filters: SpecialistFilters) {
  return applyFilters(seedSpecialists, filters).filter((specialist) =>
    filters.includePending ? true : specialist.status === "approved"
  );
}

function applyFilters(list: Specialist[], filters: SpecialistFilters) {
  return list.filter((specialist) => {
    const service = filters.service && filters.service !== "all" ? filters.service : null;
    const city = filters.city && filters.city !== "all" ? filters.city : null;
    const verification = filters.verification && filters.verification !== "all" ? filters.verification : null;

    const serviceMatch =
      !service ||
      specialist.trade === service ||
      specialist.categorySlug === service ||
      specialist.subcategorySlugs.includes(service);
    const cityMatch = !city || specialist.operatingCities.includes(city);
    const verificationMatch = !verification || specialist.verification.includes(verification);

    return serviceMatch && cityMatch && verificationMatch;
  });
}
