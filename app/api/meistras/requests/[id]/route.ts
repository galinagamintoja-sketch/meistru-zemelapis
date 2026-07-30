import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "../../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../../lib/tradesperson-account";
import { evaluateCandidate, type MatchCandidate } from "../../../../../lib/matching";

const actionSchema = z.object({ action: z.enum(["viewed", "interested", "contacted", "accepted", "rejected", "archived"]) });
const contactStatuses = new Set(["interested", "contacted", "accepted"]);
const LEGACY_CANDIDATE_SELECT = "id,display_name,phone,email,base_city,radius_km,latitude,longitude,public_status,approval_status,is_demo,public_contact_consent_at,verification_labels,service_categories!tradesperson_profiles_service_category_id_fkey(slug),profile_services(service_categories(slug),service_subcategories(slug)),operating_areas(city,radius_km)";
const CANDIDATE_SELECT = LEGACY_CANDIDATE_SELECT.replace("profile_services(", "profile_category_assignments(service_categories(slug)),profile_services(");

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireOwnedProfile();
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });
  const { id } = await params;
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Duomenų bazė nepasiekiama." }, { status: 503 });
  const { data: state } = await supabase.from("tradesperson_enquiry_states").select("status").eq("enquiry_id", id).eq("tradesperson_profile_id", profile.id).maybeSingle();
  const status = state?.status ?? "new";
  const { data: job } = await supabase.from("enquiries").select("id,tradesperson_profile_id,source_service,service_category_slug,service_subcategory_slug,source_city,source_latitude,source_longitude,message,urgency,preferred_contact_method,client_name,client_phone,client_email,created_at,enquiry_photos(id,original_name,storage_path,moderation_status)").eq("id", id).not("privacy_consent_at", "is", null).single();
  if (!job) return NextResponse.json({ error: "Užklausa nerasta." }, { status: 404 });
  const { data: initialCandidate, error: candidateError } = await supabase.from("tradesperson_profiles").select(CANDIDATE_SELECT).eq("id", profile.id).single();
  let candidate = initialCandidate;
  if (candidateError && /profile_category_assignments/i.test(candidateError.message)) {
    ({ data: candidate } = await supabase.from("tradesperson_profiles").select(LEGACY_CANDIDATE_SELECT).eq("id", profile.id).single());
  }
  const evaluation = candidate ? evaluateCandidate({ categorySlug: job.service_category_slug, subcategorySlug: job.service_subcategory_slug, city: job.source_city, latitude: job.source_latitude, longitude: job.source_longitude }, candidate as unknown as MatchCandidate) : null;
  if (job.tradesperson_profile_id !== profile.id && !evaluation?.matched) return NextResponse.json({ error: "Užklausa nerasta." }, { status: 404 });
  const photos = await Promise.all((job.enquiry_photos ?? []).filter((photo) => photo.moderation_status === "approved").map(async (photo) => {
    const { data } = await supabase.storage.from("enquiry-photos").createSignedUrl(photo.storage_path, 600);
    return data?.signedUrl ? { id: photo.id, name: photo.original_name, url: data.signedUrl } : null;
  }));
  if (status === "new") {
    await supabase.from("tradesperson_enquiry_states").upsert({ enquiry_id: id, tradesperson_profile_id: profile.id, status: "viewed", first_viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "enquiry_id,tradesperson_profile_id" });
  }
  return NextResponse.json({
    request: {
      id: job.id, service: job.source_service, category: job.service_category_slug, subcategory: job.service_subcategory_slug,
      location: job.source_city, description: job.message, timing: job.urgency, preferredContact: job.preferred_contact_method,
      createdAt: job.created_at, status: status === "new" ? "viewed" : status, photos: photos.filter(Boolean),
      contact: contactStatuses.has(status) ? { name: job.client_name, phone: job.client_phone, email: job.client_email } : null
    }
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireOwnedProfile();
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Netinkamas veiksmas." }, { status: 400 });
  const { id } = await params;
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Duomenų bazė nepasiekiama." }, { status: 503 });
  const [{ data: job }, candidateResult] = await Promise.all([
    supabase.from("enquiries").select("id,tradesperson_profile_id,service_category_slug,service_subcategory_slug,source_city,source_latitude,source_longitude").eq("id", id).not("privacy_consent_at", "is", null).single(),
    supabase.from("tradesperson_profiles").select(CANDIDATE_SELECT).eq("id", profile.id).single()
  ]);
  let candidate = candidateResult.data;
  if (candidateResult.error && /profile_category_assignments/i.test(candidateResult.error.message)) {
    ({ data: candidate } = await supabase.from("tradesperson_profiles").select(LEGACY_CANDIDATE_SELECT).eq("id", profile.id).single());
  }
  if (!job || !candidate) return NextResponse.json({ error: "Užklausa nerasta." }, { status: 404 });
  const evaluation = evaluateCandidate({ categorySlug: job.service_category_slug, subcategorySlug: job.service_subcategory_slug, city: job.source_city, latitude: job.source_latitude, longitude: job.source_longitude }, candidate as unknown as MatchCandidate);
  if (job.tradesperson_profile_id !== profile.id && !evaluation.matched) return NextResponse.json({ error: "Užklausa nerasta." }, { status: 404 });
  const now = new Date().toISOString();
  const timestamps: Record<string, string> = { updated_at: now };
  if (parsed.data.action === "interested") timestamps.interested_at = now;
  if (parsed.data.action === "contacted") timestamps.contacted_at = now;
  if (["accepted", "rejected"].includes(parsed.data.action)) timestamps.responded_at = now;
  const { error } = await supabase.from("tradesperson_enquiry_states").upsert({
    enquiry_id: id, tradesperson_profile_id: profile.id, status: parsed.data.action, ...timestamps
  }, { onConflict: "enquiry_id,tradesperson_profile_id" });
  if (error) return NextResponse.json({ error: "Būsenos pakeisti nepavyko." }, { status: 500 });
  await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: `enquiry_${parsed.data.action}`, notes: `Enquiry ${id}`, created_by_role: "tradesperson" });
  return NextResponse.json({ ok: true, status: parsed.data.action });
}
