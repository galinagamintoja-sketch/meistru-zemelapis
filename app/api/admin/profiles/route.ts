import { NextResponse } from "next/server";
import { specialists as seedSpecialists } from "../../../../lib/seed-data";
import { profileRowToSpecialist } from "../../../../lib/db-mappers";
import { createServerSupabase, requireAdminToken } from "../../../../lib/supabase";

export async function GET(request: Request) {
  if (!requireAdminToken(request)) {
    return NextResponse.json({ error: "Admin token required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";
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
        source,
        service_area_label,
        service_categories!tradesperson_profiles_service_category_id_fkey(name, slug),
        operating_areas(city, radius_km),
        profile_photos(label, url, sort_order),
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

  return NextResponse.json({ mode: "database", profiles: (data ?? []).map(profileRowToSpecialist) });
}

export async function PATCH(request: Request) {
  if (!requireAdminToken(request)) {
    return NextResponse.json({ error: "Admin token required" }, { status: 401 });
  }

  const body = await request.json();
  const id = String(body.id ?? "");
  const action = String(body.action ?? "");

  if (!id || !["approve", "reject", "suspend", "verify_contact", "verify_whatsapp"].includes(action)) {
    return NextResponse.json({ error: "Invalid admin action" }, { status: 400 });
  }

  const supabase = createServerSupabase();

  if (!supabase) {
    return NextResponse.json({ ok: true, mode: "seed", message: "Admin action accepted in demo mode." });
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
    created_by_role: "admin"
  });

  return NextResponse.json({ ok: true });
}
