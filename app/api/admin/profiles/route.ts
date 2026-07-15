import { NextResponse } from "next/server";
import { specialists as seedSpecialists } from "../../../../lib/seed-data";
import { requireAdminSession } from "../../../../lib/auth-session";
import { profileRowToSpecialist, type ProfileRow } from "../../../../lib/db-mappers";
import { createServerSupabase } from "../../../../lib/supabase";
import { isLithuanianPhone, normalizeLithuanianPhone, photoFieldMetadata } from "../../../../lib/validators";

const validStatuses = new Set(["pending", "approved", "rejected", "suspended", "all"]);
const validActions = new Set(["approve", "reject", "suspend", "verify_contact", "verify_whatsapp", "update", "moderate_photo"]);
const validSources = new Set(["self-registration", "whatsapp-onboarding", "admin-created", "imported-lead"]);

export async function GET(request: Request) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Admin Google login required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";

  if (!validStatuses.has(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  if (!supabase) {
    return NextResponse.json({
      mode: "seed",
      profiles: seedSpecialists.filter((profile) => (status === "all" ? true : profile.status === status))
    });
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
        is_demo,
        source,
        service_area_label,
        terms_accepted_at,
        privacy_acknowledged_at,
        public_contact_consent_at,
        service_categories!tradesperson_profiles_service_category_id_fkey(name, slug),
        profile_services(service_categories(name, slug), service_subcategories(name, slug)),
        operating_areas(city, radius_km),
        profile_photos(id, label, url, moderation_status, sort_order),
        reviews(client_name, rating, text, moderation_status)
      `
    )
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("approval_status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mode: "database", profiles: ((data ?? []) as unknown as ProfileRow[]).map((row) => profileRowToSpecialist(row, { includeUnapprovedPhotos: true })) });
}

export async function POST(request: Request) {
  const adminSession = requireAdminSession(request);

  if (!adminSession) {
    return NextResponse.json({ error: "Admin Google login required" }, { status: 401 });
  }

  const body = await request.json();
  const name = cleanText(body.name);
  const phone = cleanText(body.phone);
  const categorySlugs = normalizeSlugList(body.categorySlugs ?? body.categorySlug ?? body.category);
  const subcategorySlugs = normalizeSlugList(body.subcategorySlugs);
  const photoUrls = normalizeUrlList(body.photoUrls);
  const city = cleanText(body.city);
  const operatingCities = normalizeCities(body.operatingCities, city);
  const email = cleanText(body.email);
  const whatsapp = cleanText(body.whatsapp);
  const description = cleanText(body.description);
  const source = validSources.has(cleanText(body.source)) ? cleanText(body.source) : "admin-created";
  const radius = normalizeRadius(body.radius);

  if (!name || !phone || !categorySlugs.length || !city || !operatingCities.length) {
    return NextResponse.json(
      { error: "Name, phone, category, and city / operating area are required." },
      { status: 400 }
    );
  }

  if (!isLithuanianPhone(phone)) {
    return NextResponse.json({ error: "Enter a valid Lithuanian phone number." }, { status: 400 });
  }

  if (whatsapp && !isLithuanianPhone(whatsapp)) {
    return NextResponse.json({ error: "Enter a valid Lithuanian WhatsApp number." }, { status: 400 });
  }

  const normalizedPhone = normalizeLithuanianPhone(phone) || phone;
  const normalizedWhatsapp = whatsapp ? normalizeLithuanianPhone(whatsapp) || whatsapp : normalizedPhone;

  const supabase = createServerSupabase();

  if (!supabase) {
    return NextResponse.json({ ok: true, mode: "seed", message: "Admin-created profile accepted in demo mode." });
  }

  const { data: categories, error: categoryError } = await supabase
    .from("service_categories")
    .select("id,slug")
    .in("slug", categorySlugs);

  if (categoryError) {
    return NextResponse.json({ error: categoryError.message }, { status: 500 });
  }

  if (!categories?.length || categories.length !== categorySlugs.length) {
    return NextResponse.json({ error: "Choose valid categories." }, { status: 400 });
  }

  const primaryCategory = categories.find((category) => category.slug === categorySlugs[0]) ?? categories[0];
  const { data: subcategories, error: subcategoryError } = subcategorySlugs.length
    ? await supabase
        .from("service_subcategories")
        .select("id,slug,service_category_id")
        .in("slug", subcategorySlugs)
    : { data: [], error: null };

  if (subcategoryError) {
    return NextResponse.json({ error: subcategoryError.message }, { status: 500 });
  }

  if ((subcategories ?? []).length !== subcategorySlugs.length) {
    return NextResponse.json({ error: "Choose valid subcategories." }, { status: 400 });
  }

  const selectedCategoryIds = new Set(categories.map((category) => category.id));
  const selectedSubcategories = (subcategories ?? []).filter((subcategory) => selectedCategoryIds.has(subcategory.service_category_id));

  if (selectedSubcategories.length !== (subcategories ?? []).length) {
    return NextResponse.json({ error: "Selected subcategories must belong to the selected categories." }, { status: 400 });
  }

  const { data: profile, error } = await supabase
    .from("tradesperson_profiles")
    .insert({
      display_name: name,
      phone: normalizedPhone,
      whatsapp_number: normalizedWhatsapp,
      email: email || `admin-${crypto.randomUUID()}@localpro.local`,
      base_city: city,
      radius_km: radius,
      description: description || null,
      service_category_id: primaryCategory.id,
      service_area_label: operatingCities.join(", "),
      public_status: "private",
      approval_status: "pending",
      source,
      verification_labels: []
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (selectedSubcategories.length) {
    const { error: serviceError } = await supabase.from("profile_services").insert(
      selectedSubcategories.map((subcategory) => ({
        tradesperson_profile_id: profile.id,
        service_category_id: subcategory.service_category_id,
        service_subcategory_id: subcategory.id
      }))
    );

    if (serviceError) {
      return NextResponse.json({ error: serviceError.message }, { status: 500 });
    }
  }

  const { error: areaError } = await supabase.from("operating_areas").insert(
    operatingCities.map((areaCity) => ({
      tradesperson_profile_id: profile.id,
      city: areaCity,
      radius_km: radius
    }))
  );

  if (areaError) {
    return NextResponse.json({ error: areaError.message }, { status: 500 });
  }

  if (photoUrls.length) {
    const { error: photoError } = await supabase.from("profile_photos").insert(
      photoUrls.map((url, index) => ({
        tradesperson_profile_id: profile.id,
        url,
        label: null,
        alt_text: `${name} nuotrauka`,
        sort_order: index + 1,
        moderation_status: "approved"
      }))
    );

    if (photoError) {
      return NextResponse.json({ error: photoError.message }, { status: 500 });
    }
  }

  await supabase.from("admin_actions").insert({
    tradesperson_profile_id: profile.id,
    action: "profile_admin_created",
    notes: "Profile created manually from admin panel.",
    created_by_role: `admin:${adminSession.email}`
  });

  return NextResponse.json({
    ok: true,
    profile: {
      id: profile.id,
      approvalStatus: "pending",
      publicStatus: "private"
    }
  });
}

export async function PATCH(request: Request) {
  const adminSession = requireAdminSession(request);

  if (!adminSession) {
    return NextResponse.json({ error: "Admin Google login required" }, { status: 401 });
  }

  const body = await request.json();
  const id = String(body.id ?? "");
  const action = String(body.action ?? "");

  if (!id || !validActions.has(action)) {
    return NextResponse.json({ error: "Invalid admin action" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  if (!supabase) {
    return NextResponse.json({ ok: true, mode: "seed", message: "Admin action accepted in demo mode." });
  }

  if (action === "update") {
    const updates = body.profile ?? {};
    const categorySlugs = normalizeSlugList(updates.categorySlugs ?? updates.categorySlug);
    const subcategorySlugs = normalizeSlugList(updates.subcategorySlugs);
    const photoUrls = updates.photoUrls === undefined ? undefined : normalizeUrlList(updates.photoUrls);
    const hasCategoryUpdate = Object.prototype.hasOwnProperty.call(updates, "categorySlugs") || Object.prototype.hasOwnProperty.call(updates, "categorySlug");
    const hasSubcategoryUpdate = Object.prototype.hasOwnProperty.call(updates, "subcategorySlugs") || Object.prototype.hasOwnProperty.call(updates, "subcategories");
    let serviceCategoryId: string | null | undefined;
    let selectedSubcategories: Array<{ id: string; service_category_id: string }> = [];

    if (updates.phone && !isLithuanianPhone(String(updates.phone))) {
      return NextResponse.json({ error: "Enter a valid Lithuanian phone number." }, { status: 400 });
    }

    if (updates.whatsapp && !isLithuanianPhone(String(updates.whatsapp))) {
      return NextResponse.json({ error: "Enter a valid Lithuanian WhatsApp number." }, { status: 400 });
    }

    if (hasCategoryUpdate) {
      if (!categorySlugs.length) {
        serviceCategoryId = null;
      } else {
        const { data: categories, error: categoryError } = await supabase
          .from("service_categories")
          .select("id,slug")
          .in("slug", categorySlugs);

        if (categoryError) {
          return NextResponse.json({ error: categoryError.message }, { status: 500 });
        }

        if (!categories?.length || categories.length !== categorySlugs.length) {
          return NextResponse.json({ error: "Choose valid categories." }, { status: 400 });
        }

        serviceCategoryId = categories.find((category) => category.slug === categorySlugs[0])?.id ?? categories[0].id;

        if (subcategorySlugs.length) {
          const { data: subcategories, error: subcategoryError } = await supabase
            .from("service_subcategories")
            .select("id,slug,service_category_id")
            .in("slug", subcategorySlugs);

          if (subcategoryError) {
            return NextResponse.json({ error: subcategoryError.message }, { status: 500 });
          }

          if (!subcategories?.length || subcategories.length !== subcategorySlugs.length) {
            return NextResponse.json({ error: "Choose valid subcategories." }, { status: 400 });
          }

          const selectedCategoryIds = new Set(categories.map((category) => category.id));
          selectedSubcategories = subcategories.filter((subcategory) => selectedCategoryIds.has(subcategory.service_category_id));

          if (selectedSubcategories.length !== subcategories.length) {
            return NextResponse.json({ error: "Selected subcategories must belong to the selected categories." }, { status: 400 });
          }
        }
      }
    } else if (subcategorySlugs.length) {
      return NextResponse.json({ error: "Choose a category before assigning subcategories." }, { status: 400 });
    }

    const patch: Record<string, string | number | null> = {};
    assignText(patch, "display_name", updates.name);
    assignNullableText(patch, "company_name", updates.companyName);
    assignPhone(patch, "phone", updates.phone);
    assignPhone(patch, "whatsapp_number", updates.whatsapp);
    assignText(patch, "email", updates.email);
    assignText(patch, "base_city", updates.town);
    assignNullableText(patch, "service_area_label", updates.serviceArea);
    assignNullableText(patch, "description", updates.description);

    const radius = Number(updates.radius);
    if (Number.isFinite(radius) && radius >= 1 && radius <= 200) {
      patch.radius_km = Math.round(radius);
    }

    if (serviceCategoryId !== undefined) {
      patch.service_category_id = serviceCategoryId;
    }

    if (Object.keys(patch).length) {
      const { error } = await supabase.from("tradesperson_profiles").update(patch).eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (Array.isArray(updates.operatingCities)) {
      const cities = Array.from(
        new Set(
          updates.operatingCities
            .map((city: unknown) => cleanText(city))
            .filter((city: string) => city.length >= 2)
        )
      ).slice(0, 20) as string[];

      if (cities.length) {
        const { error: deleteError } = await supabase.from("operating_areas").delete().eq("tradesperson_profile_id", id);

        if (deleteError) {
          return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        const radiusKm = typeof patch.radius_km === "number" ? patch.radius_km : null;
        const { error: insertError } = await supabase.from("operating_areas").insert(
          cities.map((city) => ({
            tradesperson_profile_id: id,
            city,
            radius_km: radiusKm
          }))
        );

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      }
    }

    if (serviceCategoryId !== undefined) {
      const { error: categoryUpdateError } = await supabase.from("tradesperson_profiles").update({ service_category_id: serviceCategoryId }).eq("id", id);

      if (categoryUpdateError) {
        return NextResponse.json({ error: categoryUpdateError.message }, { status: 500 });
      }
    }

    if (hasSubcategoryUpdate) {
      const { error: deleteServicesError } = await supabase.from("profile_services").delete().eq("tradesperson_profile_id", id);

      if (deleteServicesError) {
        return NextResponse.json({ error: deleteServicesError.message }, { status: 500 });
      }

      if (selectedSubcategories.length) {
        const { error: insertServicesError } = await supabase.from("profile_services").insert(
          selectedSubcategories.map((subcategory) => ({
            tradesperson_profile_id: id,
            service_category_id: subcategory.service_category_id,
            service_subcategory_id: subcategory.id
          }))
        );

        if (insertServicesError) {
          return NextResponse.json({ error: insertServicesError.message }, { status: 500 });
        }
      }
    }

    if (photoUrls !== undefined) {
      const { error: deletePhotosError } = await supabase.from("profile_photos").delete().eq("tradesperson_profile_id", id);

      if (deletePhotosError) {
        return NextResponse.json({ error: deletePhotosError.message }, { status: 500 });
      }

      if (photoUrls.length) {
        const { error: photoError } = await supabase.from("profile_photos").insert(
          photoUrls.map((url, index) => ({
            tradesperson_profile_id: id,
            url,
            label: null,
            alt_text: updates.name ? `${updates.name} nuotrauka` : null,
            sort_order: index + 1,
            moderation_status: "approved"
          }))
        );

        if (photoError) {
          return NextResponse.json({ error: photoError.message }, { status: 500 });
        }
      }
    }
  }

  if (action === "moderate_photo") {
    const photoId = String(body.photoId ?? "");
    const moderationStatus = String(body.moderationStatus ?? "");

    if (!photoId || !["approved", "rejected", "pending"].includes(moderationStatus)) {
      return NextResponse.json({ error: "Invalid photo moderation request" }, { status: 400 });
    }

    const { error } = await supabase
      .from("profile_photos")
      .update({ moderation_status: moderationStatus })
      .eq("id", photoId)
      .eq("tradesperson_profile_id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (action === "approve") {
    const validation = await validateProfileForPublication(supabase, id);
    if (validation.length) {
      return NextResponse.json({ error: "Profilio negalima publikuoti.", validationErrors: validation }, { status: 400 });
    }
  }

  const patch =
    action === "approve"
      ? { approval_status: "approved", public_status: "public", approved_at: new Date().toISOString() }
      : action === "reject"
        ? { approval_status: "rejected", public_status: "private" }
        : action === "suspend"
          ? { approval_status: "suspended", public_status: "private" }
          : null;

  if (patch) {
    const { error } = await supabase.from("tradesperson_profiles").update(patch).eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (action === "verify_contact" || action === "verify_whatsapp") {
    const label = action === "verify_contact" ? "contact" : "whatsapp";
    const { data: profile } = await supabase
      .from("tradesperson_profiles")
      .select("verification_labels")
      .eq("id", id)
      .single();
    const labels = Array.from(new Set([...(profile?.verification_labels ?? []), label]));
    const { error } = await supabase.from("tradesperson_profiles").update({ verification_labels: labels }).eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  await supabase.from("admin_actions").insert({
    tradesperson_profile_id: id,
    action,
    notes: body.notes ?? null,
    created_by_role: `admin:${adminSession.email}`
  });

  return NextResponse.json({ ok: true });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSlugList(value: unknown) {
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(
    new Set(
      rawValues
        .map((entry) => cleanText(entry).toLowerCase())
        .filter((entry) => entry.length >= 2)
    )
  ).slice(0, 20) as string[];
}

function normalizeUrlList(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      rawValues
        .map((entry) => cleanText(entry))
        .filter((entry) => entry.length > 0 && isProbablyPhotoUrl(entry))
    )
  ).slice(0, photoFieldMetadata.maxItems) as string[];
}

function normalizeCities(value: unknown, fallbackCity: string) {
  const rawCities = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [fallbackCity];
  return Array.from(
    new Set(
      rawCities
        .map((city: unknown) => cleanText(city))
        .filter((city: string) => city.length >= 2)
    )
  ).slice(0, 20) as string[];
}

function normalizeRadius(value: unknown) {
  const radius = Number(value);
  return Number.isFinite(radius) && radius >= 1 && radius <= 200 ? Math.round(radius) : 30;
}

function assignText(patch: Record<string, string | number | null>, key: string, value: unknown) {
  const nextValue = cleanText(value);
  if (nextValue) {
    patch[key] = nextValue;
  }
}

function assignNullableText(patch: Record<string, string | number | null>, key: string, value: unknown) {
  if (typeof value === "string") {
    patch[key] = value.trim() || null;
  }
}

function assignPhone(patch: Record<string, string | number | null>, key: string, value: unknown) {
  if (typeof value === "string") {
    const nextValue = normalizeLithuanianPhone(value);
    if (nextValue) {
      patch[key] = nextValue;
    }
  }
}

function isProbablyPhotoUrl(value: string) {
  try {
    const parsed = new URL(value);
    return /^https?:$/.test(parsed.protocol);
  } catch {
    return false;
  }
}

async function validateProfileForPublication(supabase: NonNullable<ReturnType<typeof createServerSupabase>>, id: string) {
  const errors: string[] = [];
  const { data: profile, error } = await supabase
    .from("tradesperson_profiles")
    .select(`
      display_name,
      company_name,
      phone,
      latitude,
      longitude,
      service_category_id,
      description,
      public_contact_consent_at,
      profile_services(service_subcategory_id),
      profile_photos(moderation_status)
    `)
    .eq("id", id)
    .single();

  if (error || !profile) {
    return ["Profilis nerastas."];
  }

  if (!cleanText(profile.display_name) && !cleanText(profile.company_name)) {
    errors.push("Truksta asmens arba imones pavadinimo.");
  }

  if (!isLithuanianPhone(String(profile.phone ?? ""))) {
    errors.push("Truksta galiojancio telefono numerio.");
  }

  if (typeof profile.latitude !== "number" || typeof profile.longitude !== "number") {
    errors.push("Truksta geokoduotos pagrindines darbo vietos.");
  }

  if (!profile.service_category_id) {
    errors.push("Truksta pagrindines darbo srities.");
  }

  const serviceTagCount = (profile.profile_services ?? []).filter((service: { service_subcategory_id: string | null }) => service.service_subcategory_id).length;
  if (serviceTagCount < 3) {
    errors.push("Reikia bent 3 konkreciu paslaugu zymu.");
  }

  if (cleanText(profile.description).length < 80) {
    errors.push("Aprasymas turi buti bent 80 simboliu.");
  }

  if (!profile.public_contact_consent_at) {
    errors.push("Truksta aiskaus sutikimo viesai rodyti kontaktus.");
  }

  const rejectedPhotos = (profile.profile_photos ?? []).some((photo: { moderation_status: string }) => photo.moderation_status === "rejected");
  if (rejectedPhotos) {
    errors.push("Profilis turi atmestu viesu nuotrauku.");
  }

  return errors;
}
