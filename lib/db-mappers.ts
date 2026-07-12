import type { Specialist } from "./types";
import { formatVerificationSummary } from "./display";
import { profileCoordinates } from "./geo";

type ProfileRow = {
  id: string;
  display_name: string;
  company_name: string | null;
  phone: string;
  whatsapp_number: string | null;
  email: string;
  base_city: string;
  radius_km: number;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  review_score: number | null;
  review_count: number | null;
  verification_labels: string[] | null;
  public_status: string;
  approval_status: "pending" | "approved" | "rejected" | "suspended";
  source: "self-registration" | "whatsapp-onboarding" | "admin-created" | "imported-lead";
  service_area_label: string | null;
  service_categories?: { name: string; slug: string } | Array<{ name: string; slug: string }> | null;
  profile_services?: Array<{
    service_categories?: { name: string; slug: string } | Array<{ name: string; slug: string }> | null;
    service_subcategories?: { name: string; slug: string } | Array<{ name: string; slug: string }> | null;
  }>;
  operating_areas?: Array<{ city: string; radius_km: number | null }>;
  profile_photos?: Array<{ label: string | null; url: string | null; sort_order: number | null }>;
  reviews?: Array<{ client_name: string; rating: number; text: string | null; moderation_status: string }>;
};

export function profileRowToSpecialist(row: ProfileRow): Specialist {
  const operatingCities = uniqueList([row.base_city, ...(row.operating_areas?.map((area) => area.city).filter(Boolean) ?? [])]);
  const coordinates = profileCoordinates(row.latitude, row.longitude, operatingCities);
  const serviceArea = formatServiceArea(row.service_area_label, row.base_city, operatingCities, row.radius_km, row.source);
  const approvedReviews = row.reviews?.filter((review) => review.moderation_status === "approved") ?? [];
  const category = Array.isArray(row.service_categories) ? row.service_categories[0] : row.service_categories;
  const serviceCategories =
    row.profile_services
      ?.map((service) =>
        Array.isArray(service.service_categories)
          ? service.service_categories[0]
          : service.service_categories
      )
      .filter((serviceCategory): serviceCategory is { name: string; slug: string } => Boolean(serviceCategory)) ?? [];
  const categoryMap = new Map<string, { name: string; slug: string }>();
  if (category) {
    categoryMap.set(category.slug, category);
  }
  serviceCategories.forEach((serviceCategory) => categoryMap.set(serviceCategory.slug, serviceCategory));
  const categories = Array.from(categoryMap.values());
  const subcategories =
    row.profile_services
      ?.map((service) =>
        Array.isArray(service.service_subcategories)
          ? service.service_subcategories[0]
          : service.service_subcategories
      )
      .filter((subcategory): subcategory is { name: string; slug: string } => Boolean(subcategory)) ?? [];
  const photos = row.profile_photos
    ?.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((photo) => photo.label || photo.url || "Darbų nuotrauka")
    .filter(Boolean);
  const photoUrls = row.profile_photos
    ?.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((photo) => photo.url || "")
    .filter(Boolean);

  return {
    id: row.id,
    name: row.display_name,
    companyName: row.company_name,
    trade: category?.name ?? "Paslauga",
    categorySlug: category?.slug ?? "paslauga",
    categorySlugs: categories.map((item) => item.slug),
    categoryNames: categories.map((item) => item.name),
    publicStatus: row.public_status,
    subcategorySlugs: subcategories.map((subcategory) => subcategory.slug),
    subcategoryNames: subcategories.map((subcategory) => subcategory.name),
    town: row.base_city,
    operatingCities,
    radius: row.radius_km,
    lat: coordinates.lat,
    lng: coordinates.lng,
    verification: row.verification_labels ?? [],
    verificationLabel: formatVerificationSummary(row.verification_labels ?? []),
    rating: row.review_score ?? 0,
    reviewCount: row.review_count ?? approvedReviews.length,
    color: "#37503f",
    phone: row.phone,
    email: row.email,
    whatsapp: row.whatsapp_number ?? row.phone.replace(/[^\d]/g, ""),
    serviceArea,
    description: row.description ?? "",
    photos: photos?.length ? photos : ["Darbų pavyzdžiai laukiami"],
    photoUrls: photoUrls?.length ? photoUrls : undefined,
    reviews: approvedReviews.map((review) => [review.client_name, review.rating, review.text ?? ""] as [string, number, string]),
    status: row.approval_status,
    source: row.source
  };
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function formatServiceArea(label: string | null, baseCity: string, operatingCities: string[], radiusKm: number, source: ProfileRow["source"]) {
  const generated = `${operatingCities.join(", ")} + ${radiusKm} km`;

  if (!label) {
    return generated;
  }

  if (source === "self-registration" && !label.toLowerCase().includes(baseCity.toLowerCase())) {
    return generated;
  }

  return label;
}
