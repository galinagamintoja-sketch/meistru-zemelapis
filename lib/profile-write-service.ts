import { createServerSupabase } from "./supabase";
import { photoFieldMetadata } from "./validators";

type SupabaseClient = NonNullable<ReturnType<typeof createServerSupabase>>;

type ServiceCategoryRow = {
  id: string;
  slug?: string | null;
  name?: string | null;
};

type ServiceSubcategoryRow = {
  id: string;
  slug?: string | null;
  service_category_id: string;
};

type ProfileInsert = {
  display_name: string;
  phone: string;
  whatsapp_number: string;
  email: string;
  base_city: string;
  registered_address: string;
  google_place_id: string | null;
  street_name: string;
  postcode: string;
  house_number_private: string | null;
  travel_range_label: string;
  radius_km: number;
  latitude: number | null;
  longitude: number | null;
  description: string;
  service_category_id: string;
  public_status: "private";
  approval_status: "pending";
  source: "self-registration";
  consent_at: string;
  terms_accepted_at: string;
  privacy_acknowledged_at: string;
  public_contact_consent_at: string;
  marketing_consent_at: string | null;
  whatsapp_communication_consent_at: string | null;
  verification_labels: string[];
};

type HelperError = {
  message: string;
  status: number;
};

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSlugList(value: unknown) {
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(
    new Set(
      rawValues
        .map((entry) => cleanText(entry).toLowerCase())
        .filter((entry) => entry.length >= 2)
    )
  ).slice(0, 20) as string[];
}

export function normalizeUrlList(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      rawValues
        .map((entry) => cleanText(entry))
        .filter((entry) => entry.length > 0 && isProbablyPhotoUrl(entry))
    )
  ).slice(0, photoFieldMetadata.maxItems) as string[];
}

export function normalizeCities(value: unknown, fallbackCity: string) {
  const rawCities = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [fallbackCity];
  return uniqueList(rawCities.map((city: unknown) => cleanText(city))).slice(0, 20) as string[];
}

export function normalizeRadius(value: unknown) {
  const radius = Number(value);
  return Number.isFinite(radius) && radius >= 1 && radius <= 200 ? Math.round(radius) : 30;
}

export function uniqueList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function deriveAddressParts(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const street = parts[0] ?? "";
  const townLine = parts.find((part) => /\bLT-?\d{5}\b/i.test(part)) ?? parts[1] ?? "";
  const postcode = townLine.match(/\bLT-?\d{5}\b/i)?.[0] ?? "";
  const town = townLine.replace(/\bLT-?\d{5}\b/i, "").trim() || parts[1] || parts[0] || "";

  return { street, postcode, town };
}

export function assignText(patch: Record<string, string | number | null>, key: string, value: unknown) {
  const nextValue = cleanText(value);
  if (nextValue) {
    patch[key] = nextValue;
  }
}

export function assignNullableText(patch: Record<string, string | number | null>, key: string, value: unknown) {
  if (typeof value === "string") {
    patch[key] = value.trim() || null;
  }
}

export async function resolveSelectedCategories(
  supabase: SupabaseClient,
  options: {
    categorySlugs: string[];
    categoryNames?: string[];
    invalidMessage: string;
  }
): Promise<{ categories: ServiceCategoryRow[]; primaryCategory: ServiceCategoryRow } | { error: HelperError }> {
  const categoryNames = options.categoryNames ?? [];
  const expectedCategoryCount = options.categorySlugs.length || categoryNames.length;
  const categoryQuery = supabase.from("service_categories").select("id,slug,name");
  const { data: categories, error } = options.categorySlugs.length
    ? await categoryQuery.in("slug", options.categorySlugs)
    : await categoryQuery.in("name", categoryNames);

  if (error) {
    return { error: { message: error.message, status: 500 } };
  }

  if (!categories?.length || categories.length !== expectedCategoryCount) {
    return { error: { message: options.invalidMessage, status: 400 } };
  }

  const rows = categories as ServiceCategoryRow[];
  const primaryCategory = options.categorySlugs.length
    ? rows.find((category) => category.slug === options.categorySlugs[0]) ?? rows[0]
    : rows.find((category) => category.name === categoryNames[0]) ?? rows[0];

  return { categories: rows, primaryCategory };
}

export async function resolveSelectedSubcategories(
  supabase: SupabaseClient,
  options: {
    categoryIds: string[];
    subcategorySlugs: string[];
    invalidMessage: string;
    mismatchMessage: string;
  }
): Promise<{ selectedSubcategories: ServiceSubcategoryRow[] } | { error: HelperError }> {
  const { data: subcategories, error } = options.subcategorySlugs.length
    ? await supabase
        .from("service_subcategories")
        .select("id,slug,service_category_id")
        .in("slug", options.subcategorySlugs)
    : { data: [], error: null };

  if (error) {
    return { error: { message: error.message, status: 500 } };
  }

  if ((subcategories ?? []).length !== options.subcategorySlugs.length) {
    return { error: { message: options.invalidMessage, status: 400 } };
  }

  const selectedCategoryIds = new Set(options.categoryIds);
  const selectedSubcategories = ((subcategories ?? []) as ServiceSubcategoryRow[]).filter((subcategory) =>
    selectedCategoryIds.has(subcategory.service_category_id)
  );

  if (selectedSubcategories.length !== (subcategories ?? []).length) {
    return { error: { message: options.mismatchMessage, status: 400 } };
  }

  return { selectedSubcategories };
}

export function buildProfileServiceRows(profileId: string, selectedSubcategories: ServiceSubcategoryRow[]) {
  return selectedSubcategories.map((subcategory) => ({
    tradesperson_profile_id: profileId,
    service_category_id: subcategory.service_category_id,
    service_subcategory_id: subcategory.id
  }));
}

export async function insertProfileServices(
  supabase: SupabaseClient,
  profileId: string,
  selectedSubcategories: ServiceSubcategoryRow[]
) {
  const serviceRows = buildProfileServiceRows(profileId, selectedSubcategories);
  if (!serviceRows.length) {
    return null;
  }

  const { error } = await supabase.from("profile_services").insert(serviceRows);
  return error?.message ?? null;
}

export async function replaceProfileServices(
  supabase: SupabaseClient,
  profileId: string,
  selectedSubcategories: ServiceSubcategoryRow[]
) {
  const { error: deleteError } = await supabase.from("profile_services").delete().eq("tradesperson_profile_id", profileId);
  if (deleteError) {
    return deleteError.message;
  }

  return insertProfileServices(supabase, profileId, selectedSubcategories);
}

export async function insertOperatingAreas(
  supabase: SupabaseClient,
  profileId: string,
  cities: string[],
  radiusKm: number | null
) {
  if (!cities.length) {
    return null;
  }

  const { error } = await supabase.from("operating_areas").insert(
    cities.map((city) => ({
      tradesperson_profile_id: profileId,
      city,
      radius_km: radiusKm
    }))
  );
  return error?.message ?? null;
}

export async function replaceOperatingAreas(
  supabase: SupabaseClient,
  profileId: string,
  cities: string[],
  radiusKm: number | null
) {
  const { error: deleteError } = await supabase.from("operating_areas").delete().eq("tradesperson_profile_id", profileId);
  if (deleteError) {
    return deleteError.message;
  }

  return insertOperatingAreas(supabase, profileId, cities, radiusKm);
}

export function buildPhotoRows(profileId: string, photoUrls: string[], profileName: string, includeRemovedFlag = false) {
  return photoUrls.slice(0, photoFieldMetadata.maxItems).map((url, index) => ({
    tradesperson_profile_id: profileId,
    url,
    label: null,
    alt_text: profileName ? `${profileName} nuotrauka` : null,
    sort_order: index + 1,
    moderation_status: "pending",
    ...(includeRemovedFlag ? { removed_from_profile_at: null } : {})
  }));
}

export async function insertPhotoRecords(
  supabase: SupabaseClient,
  profileId: string,
  photoUrls: string[],
  profileName: string,
  includeRemovedFlag = false
) {
  const photoRows = buildPhotoRows(profileId, photoUrls, profileName, includeRemovedFlag);
  if (!photoRows.length) {
    return null;
  }

  const { error } = await supabase.from("profile_photos").insert(photoRows);
  return error?.message ?? null;
}

export async function syncProfilePhotos(
  supabase: SupabaseClient,
  profileId: string,
  photoUrls: string[],
  profileName: string
) {
  const { data: existingPhotos, error: existingError } = await supabase
    .from("profile_photos")
    .select("id,url,moderation_status")
    .eq("tradesperson_profile_id", profileId);

  if (existingError) {
    return existingError.message;
  }

  const existingByUrl = new Map(
    (existingPhotos ?? [])
      .filter((photo: { id?: string | null; url?: string | null }) => photo.id && photo.url)
      .map((photo: { id: string; url: string; moderation_status?: string }) => [photo.url, photo])
  );
  const selectedUrls = new Set(photoUrls);

  for (const photo of existingByUrl.values()) {
    if (!selectedUrls.has(photo.url)) {
      const { error } = await supabase
        .from("profile_photos")
        .update({ removed_from_profile_at: new Date().toISOString() })
        .eq("id", photo.id)
        .eq("tradesperson_profile_id", profileId);

      if (error) {
        return error.message;
      }
    }
  }

  for (const [index, url] of photoUrls.entries()) {
    const existing = existingByUrl.get(url);

    if (existing) {
      const { error } = await supabase
        .from("profile_photos")
        .update({ sort_order: index + 1, removed_from_profile_at: null })
        .eq("id", existing.id)
        .eq("tradesperson_profile_id", profileId);

      if (error) {
        return error.message;
      }

      continue;
    }

    const { error } = await supabase.from("profile_photos").insert({
      tradesperson_profile_id: profileId,
      url,
      label: null,
      alt_text: profileName ? `${profileName} nuotrauka` : null,
      sort_order: index + 1,
      moderation_status: "pending",
      removed_from_profile_at: null
    });

    if (error) {
      return error.message;
    }
  }

  return null;
}

export async function insertSelfRegistrationProfile(profile: ProfileInsert, supabase: SupabaseClient) {
  const result = await supabase.from("tradesperson_profiles").insert(profile).select("id").single();

  if (!result.error || !isMissingLocationPrivacyColumn(result.error.message)) {
    return result;
  }

  const legacyProfile: Partial<ProfileInsert> = { ...profile };
  delete legacyProfile.registered_address;
  delete legacyProfile.google_place_id;
  delete legacyProfile.street_name;
  delete legacyProfile.postcode;
  delete legacyProfile.house_number_private;
  delete legacyProfile.travel_range_label;
  delete legacyProfile.terms_accepted_at;
  delete legacyProfile.privacy_acknowledged_at;
  delete legacyProfile.public_contact_consent_at;
  delete legacyProfile.marketing_consent_at;
  delete legacyProfile.whatsapp_communication_consent_at;

  return supabase.from("tradesperson_profiles").insert(legacyProfile).select("id").single();
}

function isProbablyPhotoUrl(value: string) {
  try {
    const parsed = new URL(value);
    return /^https?:$/.test(parsed.protocol);
  } catch {
    return false;
  }
}

function isMissingLocationPrivacyColumn(message: string) {
  return /registered_address|google_place_id|street_name|postcode|travel_range_label|house_number_private|terms_accepted_at|privacy_acknowledged_at|public_contact_consent_at|marketing_consent_at|whatsapp_communication_consent_at/i.test(message);
}
