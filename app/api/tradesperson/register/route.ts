import { NextResponse } from "next/server";
import { registrationSchema, photoFieldMetadata, normalizeLithuanianPhone } from "../../../../lib/validators";
import { createServerSupabase, hasSupabaseConfig } from "../../../../lib/supabase";
import { cityCoordinates } from "../../../../lib/geo";

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
  const coordinates = cityCoordinates(payload.city);
  const operatingCities = uniqueList([payload.city, ...payload.operatingCities]);

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

  const { data: profile, error } = await supabase
    .from("tradesperson_profiles")
    .insert({
      display_name: payload.name,
      phone: normalizedPhone,
      whatsapp_number: normalizedWhatsapp,
      email: payload.email,
      base_city: payload.city,
      radius_km: payload.radiusKm,
      latitude: coordinates?.lat ?? null,
      longitude: coordinates?.lng ?? null,
      description: payload.description,
      service_category_id: primaryCategory.id,
      public_status: "private",
      approval_status: "pending",
      source: "self-registration",
      consent_at: new Date().toISOString(),
      verification_labels: []
    })
    .select("id")
    .single();

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
      radius_km: payload.radiusKm
    }))
  );

  if (areaError) {
    await cleanupProfile(profile.id, supabase);
    return NextResponse.json({ error: areaError.message }, { status: 500 });
  }

  const uploadedPhotoUrls: string[] = [];
  for (const [index, photo] of payload.photoUploads.entries()) {
    const uploaded = await uploadProfilePhoto(profile.id, photo, index, supabase);
    if ("error" in uploaded) {
      await cleanupProfile(profile.id, supabase);
      return NextResponse.json({ error: uploaded.error }, { status: 500 });
    }

    uploadedPhotoUrls.push(uploaded.url);
  }

  const photoRows = [...uploadedPhotoUrls, ...payload.photoUrls].slice(0, photoFieldMetadata.maxItems).map((url, index) => ({
    tradesperson_profile_id: profile.id,
    url,
    label: null,
    alt_text: `${payload.name} darbo nuotrauka`,
    sort_order: index + 1,
    moderation_status: "pending"
  }));

  if (photoRows.length) {
    const { error: photoError } = await supabase.from("profile_photos").insert(photoRows);
    if (photoError) {
      await cleanupProfile(profile.id, supabase);
      return NextResponse.json({ error: photoError.message }, { status: 500 });
    }
  }

  const { error: consentError } = await supabase.from("consent_logs").insert({
    tradesperson_profile_id: profile.id,
    consent_type: "self_registration_publish_review",
    consent_text: "Tradesperson submitted LocalPro registration and agreed to admin review before publishing.",
    captured_channel: "website",
    captured_at: new Date().toISOString()
  });

  if (consentError) {
    await cleanupProfile(profile.id, supabase);
    return NextResponse.json({ error: consentError.message }, { status: 500 });
  }

  const { error: actionError } = await supabase.from("admin_actions").insert({
    tradesperson_profile_id: profile.id,
    action: "profile_submitted",
    notes: "New self-registration awaits admin approval.",
    created_by_role: "system"
  });

  if (actionError) {
    await cleanupProfile(profile.id, supabase);
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

async function cleanupProfile(profileId: string, supabase: ReturnType<typeof createServerSupabase>) {
  await supabase?.from("tradesperson_profiles").delete().eq("id", profileId);
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function uploadProfilePhoto(
  profileId: string,
  photo: { name: string; type: "image/jpeg" | "image/png" | "image/webp"; dataUrl: string },
  index: number,
  supabase: NonNullable<ReturnType<typeof createServerSupabase>>
): Promise<{ url: string } | { error: string }> {
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

  const { data } = supabase.storage.from(PROFILE_PHOTOS_BUCKET).getPublicUrl(storagePath);
  return { url: data.publicUrl };
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
    public: true,
    fileSizeLimit: photoFieldMetadata.maxSizeMb * 1024 * 1024,
    allowedMimeTypes: [...photoFieldMetadata.acceptedTypes]
  });

  if (createError && !/already exists/i.test(createError.message)) {
    return `Nuotraukų saugyklos nepavyko sukurti: ${createError.message}`;
  }

  profilePhotosBucketReady = true;
  return null;
}
