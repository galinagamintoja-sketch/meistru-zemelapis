import { NextResponse } from "next/server";
import { evaluateCandidate, type MatchCandidate } from "../../../../lib/matching";
import { createServerSupabase } from "../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";

const LEGACY_CANDIDATE_SELECT = "id,display_name,phone,email,base_city,radius_km,latitude,longitude,public_status,approval_status,is_demo,public_contact_consent_at,verification_labels,service_categories!tradesperson_profiles_service_category_id_fkey(slug),profile_services(service_categories(slug),service_subcategories(slug)),operating_areas(city,radius_km)";
const CANDIDATE_SELECT = LEGACY_CANDIDATE_SELECT.replace("profile_services(", "profile_category_assignments(service_categories(slug)),profile_services(");

export async function GET(request: Request) {
  const { profile } = await requireOwnedProfile();
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ requests: [], counts: {} });

  let { data: candidate, error: candidateError } = await supabase.from("tradesperson_profiles").select(CANDIDATE_SELECT).eq("id", profile.id).single();
  if (candidateError && /profile_category_assignments/i.test(candidateError.message)) {
    ({ data: candidate } = await supabase.from("tradesperson_profiles").select(LEGACY_CANDIDATE_SELECT).eq("id", profile.id).single());
  }
  const { data: jobs, error } = await supabase.from("enquiries").select("id,tradesperson_profile_id,source_service,service_category_slug,service_subcategory_slug,source_city,source_latitude,source_longitude,message,urgency,preferred_contact_method,created_at,enquiry_photos(id)").not("privacy_consent_at", "is", null).order("created_at", { ascending: false }).limit(100);
  if (error || !candidate) return NextResponse.json({ error: "Užklausų gauti nepavyko." }, { status: 500 });
  const evaluations = (jobs ?? []).map((job) => ({
    job,
    evaluation: evaluateCandidate({
      categorySlug: job.service_category_slug,
      subcategorySlug: job.service_subcategory_slug,
      city: job.source_city,
      latitude: job.source_latitude,
      longitude: job.source_longitude
    }, candidate as unknown as MatchCandidate)
  })).filter(({ job, evaluation }) => job.tradesperson_profile_id === profile.id || evaluation.matched);
  const ids = evaluations.map(({ job }) => job.id);
  const { data: states } = ids.length
    ? await supabase.from("tradesperson_enquiry_states").select("enquiry_id,status").eq("tradesperson_profile_id", profile.id).in("enquiry_id", ids)
    : { data: [] };
  const stateMap = new Map((states ?? []).map((state) => [state.enquiry_id, state.status]));
  const filter = new URL(request.url).searchParams.get("status") ?? "new";
  const requests = evaluations.map(({ job, evaluation }) => ({
    id: job.id,
    service: job.source_service,
    category: job.service_category_slug,
    location: job.source_city,
    distanceKm: evaluation.distanceKm === null ? null : Number(evaluation.distanceKm.toFixed(1)),
    createdAt: job.created_at,
    description: job.message,
    photoCount: job.enquiry_photos?.length ?? 0,
    status: stateMap.get(job.id) ?? "new",
    matchesServices: evaluation.reason === "matched_category" || evaluation.reason === "matched_category_and_service",
    matchesRadius: evaluation.reason !== "excluded_location_mismatch"
  })).filter((item) => filter === "all" || item.status === filter);
  const counts = evaluations.reduce<Record<string, number>>((result, { job }) => {
    const status = stateMap.get(job.id) ?? "new";
    result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {});
  return NextResponse.json({ requests, counts });
}
