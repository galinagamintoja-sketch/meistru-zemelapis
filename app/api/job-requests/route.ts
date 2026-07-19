import crypto from "crypto";
import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../lib/supabase";
import { jobRequestSchema } from "../../../lib/validators";

const BUCKET = "enquiry-photos";

export async function POST(request: Request) {
  const parsed = jobRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Patikrinkite užklausos laukus", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ ok: true, mode: "seed", requestId: `request-${Date.now()}` });

  const payload = parsed.data;
  const { data: category } = await supabase.from("service_categories").select("id,slug").eq("slug", payload.categorySlug).eq("is_active", true).single();
  if (!category) return NextResponse.json({ error: "Pasirinkite galiojančią kategoriją." }, { status: 400 });

  if (payload.subcategorySlug) {
    const { data: subcategory } = await supabase.from("service_subcategories").select("id").eq("slug", payload.subcategorySlug).eq("service_category_id", category.id).eq("is_active", true).single();
    if (!subcategory) return NextResponse.json({ error: "Pasirinkite galiojančią paslaugą." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: enquiry, error } = await supabase.from("enquiries").insert({
    tradesperson_profile_id: null,
    event_type: "message",
    client_name: payload.clientName,
    client_phone: payload.clientPhone || null,
    client_email: payload.clientEmail || null,
    source_city: payload.town,
    source_service: payload.subcategorySlug || payload.categorySlug,
    message: payload.description,
    service_category_slug: payload.categorySlug,
    service_subcategory_slug: payload.subcategorySlug || null,
    source_address: payload.address,
    source_place_id: payload.placeId || null,
    source_latitude: payload.latitude,
    source_longitude: payload.longitude,
    urgency: payload.urgency,
    preferred_contact_method: payload.preferredContactMethod,
    privacy_consent_at: now,
    request_status: "new"
  }).select("id").single();

  if (error || !enquiry) return NextResponse.json({ error: error?.message ?? "Užklausos išsaugoti nepavyko." }, { status: 500 });

  const uploadedPaths: string[] = [];
  for (const [index, photo] of payload.photoUploads.entries()) {
    const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const path = `${enquiry.id}/${String(index + 1).padStart(2, "0")}-${crypto.randomUUID()}.${extension}`;
    const bytes = Buffer.from(photo.dataUrl.split(",")[1] ?? "", "base64");
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: photo.type, upsert: false });
    if (uploadError) {
      if (uploadedPaths.length) await supabase.storage.from(BUCKET).remove(uploadedPaths);
      await supabase.from("enquiries").delete().eq("id", enquiry.id);
      return NextResponse.json({ error: "Nuotraukų įkelti nepavyko." }, { status: 500 });
    }
    uploadedPaths.push(path);
  }

  if (uploadedPaths.length) {
    const { error: photoError } = await supabase.from("enquiry_photos").insert(uploadedPaths.map((storagePath, index) => ({
      enquiry_id: enquiry.id,
      storage_path: storagePath,
      original_name: payload.photoUploads[index]?.name ?? null
    })));
    if (photoError) {
      await supabase.storage.from(BUCKET).remove(uploadedPaths);
      await supabase.from("enquiries").delete().eq("id", enquiry.id);
      return NextResponse.json({ error: photoError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, requestId: enquiry.id }, { status: 201 });
}
