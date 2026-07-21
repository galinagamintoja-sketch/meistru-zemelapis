import { NextResponse } from "next/server";
import { registrationSchema, photoFieldMetadata, normalizeLithuanianPhone } from "../../../../lib/validators";
import {
  deriveAddressParts,
  insertOperatingAreas,
  insertPhotoRecords,
  insertProfileServices,
  insertSelfRegistrationProfile,
  resolveSelectedCategories,
  resolveSelectedSubcategories,
  uniqueList
} from "../../../../lib/profile-write-service";
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

  const categoryResult = await resolveSelectedCategories(supabase, {
    categorySlugs,
    categoryNames,
    invalidMessage: "Pasirinkite galiojančias darbo sritis."
  });
  if ("error" in categoryResult) {
    return NextResponse.json({ error: categoryResult.error.message }, { status: categoryResult.error.status });
  }

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

  const subcategoryResult = await resolveSelectedSubcategories(supabase, {
    categoryIds: categoryResult.categories.map((category) => category.id),
    subcategorySlugs,
    invalidMessage: "Pasirinkite galiojančias paslaugas.",
    mismatchMessage: "Pasirinktos paslaugos turi atitikti darbo sritis."
  });
  if ("error" in subcategoryResult) {
    return NextResponse.json({ error: subcategoryResult.error.message }, { status: subcategoryResult.error.status });
  }

  const { data: profile, error } = await insertSelfRegistrationProfile(
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
      service_category_id: categoryResult.primaryCategory.id,
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

  const serviceError = await insertProfileServices(supabase, profile.id, subcategoryResult.selectedSubcategories);
  if (serviceError) {
    await cleanupProfile(profile.id, supabase);
    return NextResponse.json({ error: serviceError }, { status: 500 });
  }

  const areaError = await insertOperatingAreas(supabase, profile.id, operatingCities, travelRadiusKm);
  if (areaError) {
    await cleanupProfile(profile.id, supabase);
    return NextResponse.json({ error: areaError }, { status: 500 });
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

  const photoError = await insertPhotoRecords(supabase, profile.id, [...uploadedPhotoUrls, ...payload.photoUrls], payload.name);
  if (photoError) {
    await cleanupProfile(profile.id, supabase);
    return NextResponse.json({ error: photoError }, { status: 500 });
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
