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
import { createRegistrationPhotoUploadToken } from "../../../../lib/registration-photo-upload-token";
import { createSupabaseAuthClient } from "../../../../lib/supabase-ssr";

const PROFILE_PHOTOS_BUCKET = "profile-photos";
let profilePhotosBucketReady = false;

export async function POST(request: Request) {
  const requestBody = await request.json().catch(() => null);
  const parsed = registrationSchema.safeParse(requestBody);
  const supabase = createServerSupabase();

  if (!supabase) {
    if (!parsed.success) {
      return NextResponse.json({ error: "Patikrinkite registracijos laukus", details: parsed.error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Registracija šiuo metu nepasiekiama. Bandykite vėliau." }, { status: 503 });
  }

  const auth = await createSupabaseAuthClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user?.email) {
    return NextResponse.json({ error: "Norėdami registruotis, pirmiausia prisijunkite." }, { status: 401 });
  }

  const { data: existingLocalUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const { data: existingProfile } = existingLocalUser
    ? await supabase.from("tradesperson_profiles").select("id").eq("user_id", existingLocalUser.id).maybeSingle()
    : { data: null };
  if (existingProfile) {
    return NextResponse.json({
      ok: true,
      existingProfile: true,
      profile: existingProfile,
      dashboardUrl: "/meistras/uzklausos",
      photoUploads: []
    });
  }

  if (!parsed.success) {
    return NextResponse.json({ error: "Patikrinkite registracijos laukus", details: parsed.error.flatten() }, { status: 400 });
  }
  const payload = parsed.data;

  const loginEmail = user.email.trim().toLowerCase();
  const { data: emailOwner, error: emailLookupError } = await supabase
    .from("users")
    .select("id,auth_user_id")
    .eq("email", loginEmail)
    .maybeSingle();
  if (emailLookupError) {
    return NextResponse.json({ error: "Nepavyko saugiai patikrinti paskyros. Bandykite dar kartą." }, { status: 500 });
  }
  if (emailOwner && emailOwner.auth_user_id !== user.id) {
    return NextResponse.json({
      error: "Šis el. paštas jau naudojamas ankstesnėje LocalPro paskyroje. Nauja paskyra nebuvo sukurta. Susisiekite su LocalPro pagalba dėl saugaus paskyrų susiejimo."
    }, { status: 409 });
  }

  const { data: localUser, error: localUserError } = await supabase
    .from("users")
    .upsert({
      auth_user_id: user.id,
      email: loginEmail,
      email_verified: Boolean(user.email_confirmed_at),
      role: "tradesperson"
    }, { onConflict: "auth_user_id" })
    .select("id")
    .single();
  if (localUserError || !localUser) {
    const emailCollision = localUserError?.code === "23505" || /users_email_key|duplicate key/i.test(localUserError?.message ?? "");
    return NextResponse.json({
      error: emailCollision
        ? "Šis el. paštas jau naudojamas ankstesnėje LocalPro paskyroje. Nauja paskyra nebuvo sukurta. Susisiekite su LocalPro pagalba dėl saugaus paskyrų susiejimo."
        : "Nepavyko sukurti LocalPro paskyros. Bandykite dar kartą."
    }, { status: emailCollision ? 409 : 500 });
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
      user_id: localUser.id,
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
      public_status: "public",
      approval_status: "approved",
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
    return NextResponse.json({ error: "Specialisto profilio sukurti nepavyko. Bandykite dar kartą." }, { status: 500 });
  }

  const serviceError = await insertProfileServices(supabase, profile.id, subcategoryResult.selectedSubcategories);
  if (serviceError) {
    await cleanupProfile(profile.id, supabase);
    return NextResponse.json({ error: "Paslaugų išsaugoti nepavyko. Bandykite dar kartą." }, { status: 500 });
  }

  const areaError = await insertOperatingAreas(supabase, profile.id, operatingCities, travelRadiusKm);
  if (areaError) {
    await cleanupProfile(profile.id, supabase);
    return NextResponse.json({ error: "Darbo vietovės išsaugoti nepavyko. Bandykite dar kartą." }, { status: 500 });
  }

  const photoError = await insertPhotoRecords(supabase, profile.id, payload.photoUrls, payload.name);
  if (photoError) {
    await cleanupProfile(profile.id, supabase);
    return NextResponse.json({ error: "Nuotraukų duomenų išsaugoti nepavyko. Bandykite dar kartą." }, { status: 500 });
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
    await cleanupProfile(profile.id, supabase);
    return NextResponse.json({ error: "Sutikimų išsaugoti nepavyko. Bandykite dar kartą." }, { status: 500 });
  }

  const { error: actionError } = await supabase.from("admin_actions").insert({
    tradesperson_profile_id: profile.id,
    action: "profile_submitted",
    notes: "Authenticated self-registration activated after required-field validation. Photos remain moderated separately.",
    created_by_role: "system"
  });

  if (actionError) {
    await cleanupProfile(profile.id, supabase);
    return NextResponse.json({ error: "Registracijos užbaigti nepavyko. Bandykite dar kartą." }, { status: 500 });
  }

  const uploadPlans: Array<{ storagePath: string; signedUrl: string; uploadToken: string } | null> = [];
  if (payload.photoUploads.length) {
    const bucketError = await ensureProfilePhotosBucket(supabase);
    if (bucketError) {
      uploadPlans.push(...payload.photoUploads.map(() => null));
    } else {
      for (const photo of payload.photoUploads) {
        const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
        const storagePath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
        const { data: signed, error: signError } = await supabase.storage.from(PROFILE_PHOTOS_BUCKET).createSignedUploadUrl(storagePath);
        if (signError || !signed) {
          uploadPlans.push(null);
          continue;
        }
        uploadPlans.push({
          storagePath,
          signedUrl: signed.signedUrl,
          uploadToken: createRegistrationPhotoUploadToken({
            profileId: profile.id,
            storagePath,
            name: photo.name,
            type: photo.type,
            size: photo.size,
            expiresAt: Date.now() + 15 * 60 * 1000
          })
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    mode: hasSupabaseConfig() ? "database" : "seed",
    profile: {
      id: profile.id,
      approvalStatus: "approved",
      source: "self-registration"
    },
    dashboardUrl: "/meistras/uzklausos",
    photoUploads: uploadPlans
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
    return "Nuotraukų saugyklos nepavyko patikrinti. Bandykite dar kartą.";
  }

  const { error: createError } = await supabase.storage.createBucket(PROFILE_PHOTOS_BUCKET, {
    public: false,
    fileSizeLimit: photoFieldMetadata.maxSizeMb * 1024 * 1024,
    allowedMimeTypes: [...photoFieldMetadata.acceptedTypes]
  });

  if (createError && !/already exists/i.test(createError.message)) {
    return "Nuotraukų saugyklos nepavyko paruošti. Bandykite dar kartą.";
  }

  profilePhotosBucketReady = true;
  return null;
}
