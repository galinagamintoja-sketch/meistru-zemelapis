import type { Specialist } from "./types";
import { formatVerificationSummary } from "./display";
import { approximatePublicCoordinates, profileCoordinates } from "./geo";

export type ProfileRow = {
  id: string;
  display_name: string;
  company_name: string | null;
  phone: string;
  whatsapp_number: string | null;
  email: string;
  base_city: string;
  street_name?: string | null;
  postcode?: string | null;
  radius_km: number;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  review_score: number | null;
  review_count: number | null;
  verification_labels: string[] | null;
  public_status: string;
  approval_status: "pending" | "approved" | "rejected" | "suspended";
  is_demo?: boolean | null;
  public_contact_consent_at?: string | null;
  source: "self-registration" | "whatsapp-onboarding" | "admin-created" | "imported-lead";
  service_area_label: string | null;
  service_categories?: { name: string; slug: string } | Array<{ name: string; slug: string }> | null;
  profile_services?: Array<{
    service_categories?: { name: string; slug: string } | Array<{ name: string; slug: string }> | null;
    service_subcategories?: { name: string; slug: string } | Array<{ name: string; slug: string }> | null;
  }>;
  operating_areas?: Array<{ city: string; radius_km: number | null }>;
  profile_photos?: Array<{ id?: string | null; label: string | null; url: string | null; moderation_status?: "pending" | "approved" | "rejected" | null; sort_order: number | null; removed_from_profile_at?: string | null }>;
  reviews?: Array<{ client_name: string; rating: number; text: string | null; moderation_status: string }>;
  admin_actions?: Array<{ id?: string | null; action: string; notes?: string | null; created_at: string; created_by_role?: string | null }>;
};

export function profileRowToSpecialist(row: ProfileRow, options: { includeUnapprovedPhotos?: boolean; includeRemovedPhotos?: boolean } = {}): Specialist {
  const operatingCities = uniqueList([row.base_city, ...(row.operating_areas?.map((area) => area.city).filter(Boolean) ?? [])]);
  const coordinates = profileCoordinates(row.latitude, row.longitude, operatingCities);
  const publicCoordinates = approximatePublicCoordinates(row.id, coordinates);
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
  const visiblePhotoRows = (row.profile_photos ?? [])
    .filter((photo) => options.includeRemovedPhotos || !photo.removed_from_profile_at)
    .filter((photo) => options.includeUnapprovedPhotos || (photo.moderation_status ?? "approved") === "approved")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const photos = visiblePhotoRows
    .map((photo) => photo.label || photo.url || "Darbu nuotrauka")
    .filter(Boolean);
  const photoUrls = visiblePhotoRows
    .map((photo) => photo.url || "")
    .filter(Boolean);
  const photoRecords = visiblePhotoRows
    .filter((photo) => photo.id && photo.url)
    .map((photo) => ({
      id: String(photo.id),
      url: String(photo.url),
      label: photo.label,
      moderationStatus: photo.moderation_status ?? "approved",
      removedAt: photo.removed_from_profile_at ?? null
    }));

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
    district: row.base_city,
    streetArea: undefined,
    approximateLocation: formatApproximateLocation(row.base_city),
    operatingCities,
    radius: row.radius_km,
    lat: publicCoordinates.lat,
    lng: publicCoordinates.lng,
    registeredLat: coordinates.lat,
    registeredLng: coordinates.lng,
    verification: row.verification_labels ?? [],
    isAvailableSoon: row.verification_labels?.includes("available-soon") ?? false,
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
    photoRecords: photoRecords.length ? photoRecords : undefined,
    adminActions: (row.admin_actions ?? []).map((action) => ({
      id: String(action.id ?? `${action.action}-${action.created_at}`),
      action: action.action,
      notes: action.notes ?? null,
      createdAt: action.created_at,
      createdByRole: action.created_by_role ?? null
    })),
    reviews: approvedReviews.map((review) => [review.client_name, review.rating, review.text ?? ""] as [string, number, string]),
    status: row.approval_status,
    source: row.source,
    isDemo: Boolean(row.is_demo),
    publicContactConsentAt: row.public_contact_consent_at ?? null
  };
}

export function toPublicSafeSpecialist(specialist: Specialist): Specialist {
  const publicSpecialist = { ...specialist };
  delete publicSpecialist.registeredLat;
  delete publicSpecialist.registeredLng;
  delete publicSpecialist.streetArea;
  delete publicSpecialist.adminActions;
  delete publicSpecialist.photoRecords;
  return publicSpecialist;
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

function formatApproximateLocation(baseCity: string) {
  return baseCity;
}
