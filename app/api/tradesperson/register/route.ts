import { NextResponse } from "next/server";
import { registrationSchema, photoFieldMetadata, normalizeLithuanianPhone } from "../../../../lib/validators";
import { createServerSupabase, hasSupabaseConfig } from "../../../../lib/supabase";
import { resolveLithuanianCoordinates, resolveRegisteredAddressCoordinates } from "../../../../lib/geo";

const PROFILE_PHOTOS_BUCKET = "profile-photos";
let profilePhotosBucketReady = false;

export async function POST(request: Request) {
  const parsed = registrationSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Patikrinkite registracijos laukus", details: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const supabase = createServerSupabase();

  if (!supabase) {
    return NextResponse.json({
      ok: true,
      mode: "seed",
      message: "Registracija priimta demonstraciniu režimu. Prijungus Supabase, profilis bus saugomas duomenų bazėje.",
      profile: {
        id: `pending-${Date.now()}`,
        approvalStatus: "pending",
        source: "self-registration"
      }
    });
  }

  const categorySlugs = uniqueList(payload.categorySlugs);
  const categoryNames = !categorySlugs.length && payload.trade ? uniqueList([payload.trade]) : [];
  const subcategorySlugs = uniqueList(payload.subcategorySlugs);

  if (!categorySlugs.length && !categoryNames.length) {
    return NextResponse.json({ error: "Pasirinkite bent vieną darbo sritį." }, { status: 400 });
  }

  const categoryQuery = supabase.from("service_categories").select("id,slug,name");
  const { data: categories, error: categoriesError } = categorySlugs.length
    ? await categoryQuery.in("slug", categorySlugs)
    : await categoryQuery.in("name", categoryNames);

  if (categoriesError) {
    return NextResponse.json({ error: categoriesError.message }, { status: 500 });
  }

  const expectedCategoryCount = categorySlugs.length || categoryNames.length;

  if (!categories?.length || categories.length !== expectedCategoryCount) {
    return NextResponse.json({ error: "Pasirinkite galiojančias darbo sritis." }, { status: 400 });
  }

  const primaryCategory = categorySlugs.length
    ? categories.find((category) => category.slug === categorySlugs[0]) ?? categories[0]
    : categories.find((category) => category.name === categoryNames[0]) ?? categories[0];
  const normalizedPhone = normalizeLithuanianPhone(payload.phone) || payload.phone;
  const normalizedWhatsapp = payload.whatsapp ? normalizeLithuanianPhone(payload.whatsapp) || payload.whatsapp : normalizedPhone;
  const addressParts = deriveAddressParts(payload.address);
  const baseTown = payload.town || payload.city || addressParts.town || "Lietuva";
  const streetName = payload.street || addressParts.street || payload.address;
  const postcode = payload.postcode || addressParts.postcode;
  const travelRadiusKm = payload.travelRange === "lt" ? 150 : Number(payload.travelRange);
  const coordinates =
    typeof payload.latitude === "number" && typeof payload.longitude === "number"
      ? { lat: payload.latitude, lng: payload.longitude }
      : payload.street || payload.postcode || payload.town
        ? await resolveRegisteredAddressCoordinates({
            town: baseTown,
            street: streetName,
            postcode,
            houseNumber: payload.houseNumber
          })
        : await resolveLithuanianCoordinates(payload.address);
  const operatingCities = uniqueList([baseTown, ...(payload.operatingCities ?? [])]);
  const now = new Date().toISOString();

  const { data: subcategories, error: subcategoriesError } = subcategorySlugs.length
    ? await supabase
        .from("service_subcategories")
        .select("id,slug,service_category_id")
        .in("slug", subcategorySlugs)
    : { data: [], error: null };

  if (subcategoriesError) {
    return NextResponse.json({ error: subcategoriesError.message }, { status: 500 });
  }

  if ((subcategories ?? []).length !== subcategorySlugs.length) {
    return NextResponse.json({ error: "Pasirinkite galiojančias paslaugas." }, { status: 400 });
  }

  const validCategoryIds = new Set(categories.map((category) => category.id));
  const validSubcategories = (subcategories ?? []).filter((subcategory) => validCategoryIds.has(subcategory.service_category_id));

  if (validSubcategories.length !== (subcategories ?? []).length) {
    return NextResponse.json({ error: "Pasirinktos paslaugos turi atitikti darbo sritis." }, { status: 400 });
  }

  const { data: profile, error } = await insertProfile(
    {
      display_name: payload.name,
      phone: normalizedPhone,
      whatsapp_number: normalizedWhatsapp,
      email: payload.email,
      base_city: baseTown,
      registered_address: payload.address,
      google_place_id: payload.placeId || null,
      street_name: streetName,
      postcode,
      house_number_private: payload.houseNumber || null,
      travel_range_label: payload.travelRange === "lt" ? "Visa Lietuva" : `Iki ${payload.travelRange} km`,
      radius_km: travelRadiusKm,
      latitude: coordinates?.lat ?? null,
      longitude: coordinates?.lng ?? null,
      description: payload.description,
      service_category_id: primaryCategory.id,
      public_status: "private",
      approval_status: "pending",
      source: "self-registration",
      consent_at: now,
      terms_accepted_at: now,
      privacy_acknowledged_at: now,
      public_contact_consent_at: now,
      marketing_consent_at: payload.marketingConsent ? now : null,
      whatsapp_communication_consent_at: payload.whatsappCommunicationConsent ? now : null,
      verification_labels: []
    },
    supabase
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const serviceRows = validSubcategories.map((subcategory) => ({
    tradesperson_profile_id: profile.id,
    service_category_id: subcategory.service_category_id,
    service_subcategory_id: subcategory.id
  }));

  if (serviceRows.length) {
    const { error: serviceError } = await supabase.from("profile_services").insert(serviceRows);
    if (serviceError) {
      await cleanupProfile(profile.id, supabase);
      return NextResponse.json({ error: serviceError.message }, { status: 500 });
    }
  }

  const { error: areaError } = await supabase.from("operating_areas").insert(
    operatingCities.map((city) => ({
      tradesperson_profile_id: profile.id,
      city,
      radius_km: travelRadiusKm
    }))
  );

  if (areaError) {
    await cleanupProfile(profile.id, supabase);
    return NextResponse.json({ error: areaError.message }, { status: 500 });
  }

  const uploadedPhotos: Array<{ storagePath: string }> = [];
  for (const [index, photo] of payload.photoUploads.entries()) {
    const uploaded = await uploadProfilePhoto(profile.id, photo, index, supabase);
    if ("error" in uploaded) {
      await cleanupProfile(profile.id, uploadedPhotos.map((item) => item.storagePath), supabase);
      return NextResponse.json({ error: uploaded.error }, { status: 500 });
    }

    uploadedPhotos.push(uploaded);
  }

  const photoRows = [
    ...uploadedPhotos.map((photo) => ({ url: null, storage_path: photo.storagePath })),
    ...payload.photoUrls.map((url) => ({ url, storage_path: null }))
  ].slice(0, photoFieldMetadata.maxItems).map((photo, index) => ({
    tradesperson_profile_id: profile.id,
    ...photo,
    label: null,
    alt_text: `${payload.name} darbo nuotrauka`,
    sort_order: index + 1,
    moderation_status: "pending"
  }));

  if (photoRows.length) {
    const { error: photoError } = await supabase.from("profile_photos").insert(photoRows);
    if (photoError) {
      await cleanupProfile(profile.id, uploadedPhotos.map((item) => item.storagePath), supabase);
      return NextResponse.json({ error: photoError.message }, { status: 500 });
    }
  }

  const consentRows = [
    {
      tradesperson_profile_id: profile.id,
      consent_type: "terms_accepted",
      consent_text: "Tradesperson accepted LocalPro terms during registration.",
      captured_channel: "website",
      captured_at: now
    },
    {
      tradesperson_profile_id: profile.id,
      consent_type: "privacy_acknowledged",
      consent_text: "Tradesperson acknowledged the LocalPro privacy notice during registration.",
      captured_channel: "website",
      captured_at: now
    },
    {
      tradesperson_profile_id: profile.id,
      consent_type: "public_contact_display",
      consent_text: "Tradesperson gave explicit permission to publicly display selected contact details after admin approval.",
      captured_channel: "website",
      captured_at: now
    },
    ...(payload.marketingConsent
      ? [{
          tradesperson_profile_id: profile.id,
          consent_type: "marketing_messages",
          consent_text: "Tradesperson opted in to optional LocalPro marketing messages.",
          captured_channel: "website",
          captured_at: now
        }]
      : []),
    ...(payload.whatsappCommunicationConsent
      ? [{
          tradesperson_profile_id: profile.id,
          consent_type: "whatsapp_communication",
          consent_text: "Tradesperson opted in to WhatsApp communication about the registration.",
          captured_channel: "website",
          captured_at: now
        }]
      : [])
  ];

  const { error: consentError } = await supabase.from("consent_logs").insert(consentRows);

  if (consentError) {
    await cleanupProfile(profile.id, uploadedPhotos.map((item) => item.storagePath), supabase);
    return NextResponse.json({ error: consentError.message }, { status: 500 });
  }

  const { error: actionError } = await supabase.from("admin_actions").insert({
    tradesperson_profile_id: profile.id,
    action: "profile_submitted",
    notes: "New self-registration awaits admin approval.",
    created_by_role: "system"
  });

  if (actionError) {
    await cleanupProfile(profile.id, uploadedPhotos.map((item) => item.storagePath), supabase);
    return NextResponse.json({ error: actionError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mode: hasSupabaseConfig() ? "database" : "seed",
    profile: {
      id: profile.id,
      approvalStatus: "pending",
      source: "self-registration"
    }
  });
}

async function cleanupProfile(
  profileId: string,
  storagePaths: string[] | ReturnType<typeof createServerSupabase>,
  maybeSupabase?: ReturnType<typeof createServerSupabase>
) {
  const supabase = Array.isArray(storagePaths) ? maybeSupabase : storagePaths;
  const paths = Array.isArray(storagePaths) ? storagePaths : [];
  if (!supabase) return;

  if (paths.length) {
    await supabase.storage.from(PROFILE_PHOTOS_BUCKET).remove(paths);
  }
  await supabase.from("admin_actions").delete().eq("tradesperson_profile_id", profileId);
  await supabase.from("consent_logs").delete().eq("tradesperson_profile_id", profileId);
  await supabase.from("tradesperson_profiles").delete().eq("id", profileId);
}

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

async function insertProfile(profile: ProfileInsert, supabase: NonNullable<ReturnType<typeof createServerSupabase>>) {
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

function isMissingLocationPrivacyColumn(message: string) {
  return /registered_address|google_place_id|street_name|postcode|travel_range_label|house_number_private|terms_accepted_at|privacy_acknowledged_at|public_contact_consent_at|marketing_consent_at|whatsapp_communication_consent_at/i.test(message);
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function deriveAddressParts(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const street = parts[0] ?? "";
  const townLine = parts.find((part) => /\bLT-?\d{5}\b/i.test(part)) ?? parts[1] ?? "";
  const postcode = townLine.match(/\bLT-?\d{5}\b/i)?.[0] ?? "";
  const town = townLine.replace(/\bLT-?\d{5}\b/i, "").trim() || parts[1] || parts[0] || "";

  return { street, postcode, town };
}

async function uploadProfilePhoto(
  profileId: string,
  photo: { name: string; type: "image/jpeg" | "image/png" | "image/webp"; dataUrl: string },
  index: number,
  supabase: NonNullable<ReturnType<typeof createServerSupabase>>
): Promise<{ storagePath: string } | { error: string }> {
  const bucketError = await ensureProfilePhotosBucket(supabase);
  if (bucketError) {
    return { error: bucketError };
  }

  const base64 = photo.dataUrl.split(",")[1];
  if (!base64) {
    return { error: "Nuotraukos failas netinkamas." };
  }

  const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${profileId}/${index + 1}-${crypto.randomUUID()}.${extension}`;
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  const { error } = await supabase.storage.from(PROFILE_PHOTOS_BUCKET).upload(storagePath, bytes, {
    contentType: photo.type,
    upsert: false
  });

  if (error) {
    return { error: `Nuotraukos nepavyko įkelti: ${error.message}` };
  }

  return { storagePath };
}

async function ensureProfilePhotosBucket(supabase: NonNullable<ReturnType<typeof createServerSupabase>>) {
  if (profilePhotosBucketReady) {
    return null;
  }

  const { error: getError } = await supabase.storage.getBucket(PROFILE_PHOTOS_BUCKET);

  if (!getError) {
    profilePhotosBucketReady = true;
    return null;
  }

  const statusCode = String((getError as { statusCode?: string | number }).statusCode ?? "");
  const isMissingBucket = statusCode === "404" || /not found|does not exist/i.test(getError.message);

  if (!isMissingBucket) {
    return `Nuotraukų saugyklos nepavyko patikrinti: ${getError.message}`;
  }

  const { error: createError } = await supabase.storage.createBucket(PROFILE_PHOTOS_BUCKET, {
    public: false,
    fileSizeLimit: photoFieldMetadata.maxSizeMb * 1024 * 1024,
    allowedMimeTypes: [...photoFieldMetadata.acceptedTypes]
  });

  if (createError && !/already exists/i.test(createError.message)) {
    return `Nuotraukų saugyklos nepavyko sukurti: ${createError.message}`;
  }

  profilePhotosBucketReady = true;
  return null;
}
