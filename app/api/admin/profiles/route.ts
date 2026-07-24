import { NextResponse } from "next/server";
import { specialists as seedSpecialists } from "../../../../lib/seed-data";
import { requireAdminSession } from "../../../../lib/auth-session";
import { profileRowToSpecialist, toPublicSafeSpecialist, type ProfileRow } from "../../../../lib/db-mappers";
import { signManagedPhotoUrls } from "../../../../lib/specialists";
import {
  assignNullableText,
  assignText,
  cleanText,
  insertOperatingAreas,
  insertPhotoRecords,
  insertProfileServices,
  normalizeCities,
  normalizeRadius,
  normalizeSlugList,
  normalizeUrlList,
  replaceOperatingAreas,
  replaceProfileServices,
  resolveSelectedCategories,
  resolveSelectedSubcategories,
  syncProfilePhotos
} from "../../../../lib/profile-write-service";
import { createServerSupabase } from "../../../../lib/supabase";
import { isLithuanianPhone, normalizeLithuanianPhone } from "../../../../lib/validators";

const validStatuses = new Set(["pending", "approved", "rejected", "suspended", "all"]);
const validActions = new Set(["approve", "reject", "suspend", "return_pending", "verify_contact", "verify_whatsapp", "update", "moderate_photo", "record_public_contact_consent", "admin_note", "create_photo_upload", "finalize_photo_upload", "abort_photo_upload", "remove_photo", "reorder_photos"]);
const validSources = new Set(["self-registration", "whatsapp-onboarding", "admin-created", "imported-lead"]);
const validConsentChannels = new Set(["website", "whatsapp", "telephone", "written_form"]);

export async function GET(request: Request) {
  if (!requireAdminSession(request)) {
    return NextResponse.json({ error: "Admin Google login required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";
  const previewId = searchParams.get("preview");

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

  const select = `
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
    profile_photos(id, label, url, storage_path, moderation_status, sort_order, removed_from_profile_at),
    reviews(client_name, rating, text, moderation_status),
    admin_actions(id, action, notes, created_at, created_by_role)
  `;

  if (previewId) {
    const { data, error } = await supabase
      .from("tradesperson_profiles")
      .select(select)
      .eq("id", previewId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const [signedProfile] = await signManagedPhotoUrls([data as unknown as ProfileRow], false);

    return NextResponse.json({
      mode: "database",
      specialist: toPublicSafeSpecialist(profileRowToSpecialist(signedProfile))
    });
  }

  let query = supabase
    .from("tradesperson_profiles")
    .select(select)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("approval_status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const signedProfiles = await signManagedPhotoUrls((data ?? []) as unknown as ProfileRow[], true);

  return NextResponse.json({
    mode: "database",
    profiles: signedProfiles.map((row) => profileRowToSpecialist(row, { includeUnapprovedPhotos: true, includeRemovedPhotos: true }))
  });
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

  const categoryResult = await resolveSelectedCategories(supabase, {
    categorySlugs,
    invalidMessage: "Choose valid categories."
  });
  if ("error" in categoryResult) {
    return NextResponse.json({ error: categoryResult.error.message }, { status: categoryResult.error.status });
  }

  const subcategoryResult = await resolveSelectedSubcategories(supabase, {
    categoryIds: categoryResult.categories.map((category) => category.id),
    subcategorySlugs,
    invalidMessage: "Choose valid subcategories.",
    mismatchMessage: "Selected subcategories must belong to the selected categories."
  });
  if ("error" in subcategoryResult) {
    return NextResponse.json({ error: subcategoryResult.error.message }, { status: subcategoryResult.error.status });
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
      service_category_id: categoryResult.primaryCategory.id,
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

  const serviceError = await insertProfileServices(supabase, profile.id, subcategoryResult.selectedSubcategories);
  if (serviceError) {
    return NextResponse.json({ error: serviceError }, { status: 500 });
  }

  const areaError = await insertOperatingAreas(supabase, profile.id, operatingCities, radius);
  if (areaError) {
    return NextResponse.json({ error: areaError }, { status: 500 });
  }

  const photoError = await insertPhotoRecords(supabase, profile.id, photoUrls, name, true);
  if (photoError) {
    return NextResponse.json({ error: photoError }, { status: 500 });
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
        const categoryResult = await resolveSelectedCategories(supabase, {
          categorySlugs,
          invalidMessage: "Choose valid categories."
        });
        if ("error" in categoryResult) {
          return NextResponse.json({ error: categoryResult.error.message }, { status: categoryResult.error.status });
        }

        serviceCategoryId = categoryResult.primaryCategory.id;

        if (subcategorySlugs.length) {
          const subcategoryResult = await resolveSelectedSubcategories(supabase, {
            categoryIds: categoryResult.categories.map((category) => category.id),
            subcategorySlugs,
            invalidMessage: "Choose valid subcategories.",
            mismatchMessage: "Selected subcategories must belong to the selected categories."
          });
          if ("error" in subcategoryResult) {
            return NextResponse.json({ error: subcategoryResult.error.message }, { status: subcategoryResult.error.status });
          }

          selectedSubcategories = subcategoryResult.selectedSubcategories;
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
        const radiusKm = typeof patch.radius_km === "number" ? patch.radius_km : null;
        const areaError = await replaceOperatingAreas(supabase, id, cities, radiusKm);

        if (areaError) {
          return NextResponse.json({ error: areaError }, { status: 500 });
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
      const serviceError = await replaceProfileServices(supabase, id, selectedSubcategories);
      if (serviceError) {
        return NextResponse.json({ error: serviceError }, { status: 500 });
      }
    }

    if (photoUrls !== undefined) {
      const photoSyncError = await syncProfilePhotos(supabase, id, photoUrls, cleanText(updates.name));

      if (photoSyncError) {
        return NextResponse.json({ error: photoSyncError }, { status: 500 });
      }
    }
  }

  if (action === "moderate_photo") {
    const photoId = String(body.photoId ?? "");
    const moderationStatus = String(body.moderationStatus ?? "");

    if (!photoId || !["approved", "rejected", "pending"].includes(moderationStatus)) {
      return NextResponse.json({ error: "Invalid photo moderation request" }, { status: 400 });
    }

    const photoPatch = {
      moderation_status: moderationStatus,
      removed_from_profile_at: moderationStatus === "rejected" ? new Date().toISOString() : null
    };
    const { error } = await supabase
      .from("profile_photos")
      .update(photoPatch)
      .eq("id", photoId)
      .eq("tradesperson_profile_id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (action === "create_photo_upload") {
    const photo = body.photo ?? {};
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const type = String(photo.type ?? "");
    const size = Number(photo.size);
    if (!allowedTypes.has(type) || !Number.isFinite(size) || size < 1 || size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "JPG, PNG arba WebP nuotrauka gali būti iki 5 MB." }, { status: 400 });
    }
    const { count } = await supabase.from("profile_photos").select("id", { count: "exact", head: true }).eq("tradesperson_profile_id", id).is("removed_from_profile_at", null);
    if ((count ?? 0) >= 8) return NextResponse.json({ error: "Galima turėti daugiausia 8 nuotraukas." }, { status: 400 });
    const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const storagePath = `${id}/${crypto.randomUUID()}.${extension}`;
    const { data: signed, error: signError } = await supabase.storage.from("profile-photos").createSignedUploadUrl(storagePath);
    if (signError || !signed) return NextResponse.json({ error: signError?.message ?? "Nepavyko paruošti įkėlimo." }, { status: 500 });
    return NextResponse.json({ ok: true, storagePath, signedUrl: signed.signedUrl, token: signed.token });
  }

  if (action === "finalize_photo_upload") {
    const storagePath = String(body.storagePath ?? "");
    const name = cleanText(body.name).slice(0, 160);
    const prefix = `${id}/`;
    if (!storagePath.startsWith(prefix) || storagePath.includes("..")) return NextResponse.json({ error: "Netinkamas saugyklos kelias." }, { status: 400 });
    const fileName = storagePath.slice(prefix.length);
    const { data: objects, error: listError } = await supabase.storage.from("profile-photos").list(id, { search: fileName, limit: 2 });
    const uploaded = objects?.find((item) => item.name === fileName);
    const size = Number(uploaded?.metadata?.size ?? 0);
    const mime = String(uploaded?.metadata?.mimetype ?? "");
    if (listError || !uploaded || size < 1 || size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      await supabase.storage.from("profile-photos").remove([storagePath]);
      return NextResponse.json({ error: "Įkeltas failas neatitiko nuotraukos reikalavimų." }, { status: 400 });
    }
    const { count } = await supabase.from("profile_photos").select("id", { count: "exact", head: true }).eq("tradesperson_profile_id", id).is("removed_from_profile_at", null);
    if ((count ?? 0) >= 8) {
      await supabase.storage.from("profile-photos").remove([storagePath]);
      return NextResponse.json({ error: "Galima turėti daugiausia 8 nuotraukas." }, { status: 400 });
    }
    const { error: insertError } = await supabase.from("profile_photos").insert({
      tradesperson_profile_id: id, storage_path: storagePath, url: null,
      label: name || "Profilio nuotrauka",
      moderation_status: "pending", sort_order: count ?? 0
    });
    if (insertError) {
      await supabase.storage.from("profile-photos").remove([storagePath]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  if (action === "abort_photo_upload") {
    const storagePath = String(body.storagePath ?? "");
    if (storagePath.startsWith(`${id}/`) && !storagePath.includes("..")) await supabase.storage.from("profile-photos").remove([storagePath]);
    return NextResponse.json({ ok: true });
  }

  if (action === "remove_photo") {
    const photoId = String(body.photoId ?? "");
    if (!photoId) return NextResponse.json({ error: "Nuotrauka nerasta." }, { status: 400 });
    const { error } = await supabase.from("profile_photos").update({ removed_from_profile_at: new Date().toISOString() }).eq("id", photoId).eq("tradesperson_profile_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (action === "reorder_photos") {
    const photoIds = Array.isArray(body.photoIds) ? body.photoIds.map(String).slice(0, 8) : [];
    if (!photoIds.length || new Set(photoIds).size !== photoIds.length) return NextResponse.json({ error: "Netinkamas nuotraukų eiliškumas." }, { status: 400 });
    const updates = await Promise.all(photoIds.map((photoId: string, sortOrder: number) =>
      supabase.from("profile_photos").update({ sort_order: sortOrder }).eq("id", photoId).eq("tradesperson_profile_id", id)
    ));
    const error = updates.find((result) => result.error)?.error;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (action === "admin_note") {
    const note = cleanText(body.notes);
    if (note.length < 2) {
      return NextResponse.json({ error: "Įrašykite administratoriaus pastabą." }, { status: 400 });
    }
  }

  if (action === "record_public_contact_consent") {
    const channel = cleanText(body.consentChannel);
    const consentText = cleanText(body.consentText);
    const evidenceReference = cleanText(body.evidenceReference);
    const capturedAtRaw = cleanText(body.capturedAt);
    const capturedAt = capturedAtRaw ? new Date(capturedAtRaw) : new Date();

    if (!validConsentChannels.has(channel)) {
      return NextResponse.json({ error: "Choose a valid consent channel." }, { status: 400 });
    }

    if (consentText.length < 20) {
      return NextResponse.json({ error: "Consent wording or reference is required." }, { status: 400 });
    }

    if (Number.isNaN(capturedAt.getTime())) {
      return NextResponse.json({ error: "Captured timestamp is invalid." }, { status: 400 });
    }

    const capturedAtIso = capturedAt.toISOString();
    const { error: updateError } = await supabase
      .from("tradesperson_profiles")
      .update({ public_contact_consent_at: capturedAtIso })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { error: consentError } = await supabase.from("consent_logs").insert({
      tradesperson_profile_id: id,
      consent_type: "public_contact_display",
      consent_text: consentText,
      captured_channel: channel,
      captured_at: capturedAtIso,
      evidence_reference: evidenceReference || null,
      captured_by_role: `admin:${adminSession.email}`
    });

    if (consentError) {
      return NextResponse.json({ error: consentError.message }, { status: 500 });
    }

    const { error: auditError } = await supabase.from("admin_actions").insert({
      tradesperson_profile_id: id,
      action,
      notes: [
        `channel=${channel}`,
        `captured_at=${capturedAtIso}`,
        evidenceReference ? `evidence=${evidenceReference}` : null
      ].filter(Boolean).join("; "),
      created_by_role: `admin:${adminSession.email}`
    });

    if (auditError) {
      return NextResponse.json({ error: auditError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
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
          : action === "return_pending"
            ? { approval_status: "pending", public_status: "private" }
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

function assignPhone(patch: Record<string, string | number | null>, key: string, value: unknown) {
  if (typeof value === "string") {
    const nextValue = normalizeLithuanianPhone(value);
    if (nextValue) {
      patch[key] = nextValue;
    }
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
        service_category_id,
        description,
        public_contact_consent_at,
        operating_areas(city, radius_km),
        profile_services(service_subcategory_id),
        profile_photos(moderation_status, removed_from_profile_at)
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

  if (!profile.service_category_id) {
    errors.push("Truksta pagrindines darbo srities.");
  }

  const operatingAreaCount = (profile.operating_areas ?? []).filter((area: { city?: string | null; radius_km?: number | null }) => cleanText(area.city).length >= 2 && Number(area.radius_km) > 0).length;
  if (operatingAreaCount < 1) {
    errors.push("Truksta aptarnavimo miesto ir spindulio.");
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

  const visiblePhotos = (profile.profile_photos ?? []).filter((photo: { moderation_status: string; removed_from_profile_at?: string | null }) => !photo.removed_from_profile_at);
  const hasUnapprovedVisiblePhoto = visiblePhotos.some((photo: { moderation_status: string }) => photo.moderation_status !== "approved");
  if (hasUnapprovedVisiblePhoto) {
    errors.push("Visos rodomos nuotraukos turi būti patvirtintos arba pašalintos iš profilio.");
  }

  return errors;
}
