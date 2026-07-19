import { NextResponse } from "next/server";
import { profileRowToSpecialist, type ProfileRow } from "../../../../../lib/db-mappers";
import { evaluateCandidates, type MatchCandidate, type MatchReason } from "../../../../../lib/matching";
import { signManagedPhotoUrls } from "../../../../../lib/specialists";
import { createServerSupabase } from "../../../../../lib/supabase";

const CANDIDATE_SELECT = "id,display_name,company_name,phone,whatsapp_number,email,base_city,radius_km,latitude,longitude,description,review_score,review_count,verification_labels,public_status,approval_status,is_demo,public_contact_consent_at,source,service_area_label,service_categories!tradesperson_profiles_service_category_id_fkey(name,slug),profile_services(service_categories(name,slug),service_subcategories(name,slug)),operating_areas(city,radius_km),profile_photos(id,label,url,storage_path,moderation_status,sort_order,removed_from_profile_at),reviews(client_name,rating,text,moderation_status)";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Užklausa nerasta" }, { status: 404 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ matches: [], exclusions: {}, ordering: "relevance_desc,distance_asc,name_asc,id_asc" });

  const { data: job, error: jobError } = await supabase.from("enquiries").select("id,service_category_slug,service_subcategory_slug,source_city,source_latitude,source_longitude,privacy_consent_at").eq("id", id).not("privacy_consent_at", "is", null).single();
  if (jobError || !job) return NextResponse.json({ error: "Užklausa nerasta" }, { status: 404 });

  const { data, error } = await supabase.from("tradesperson_profiles").select(CANDIDATE_SELECT);
  if (error) return NextResponse.json({ error: "Atitikmenų apskaičiuoti nepavyko" }, { status: 500 });
  const rows = (data ?? []) as unknown as ProfileRow[];
  const result = evaluateCandidates({ categorySlug: job.service_category_slug, subcategorySlug: job.service_subcategory_slug, city: job.source_city, latitude: job.source_latitude, longitude: job.source_longitude }, rows as unknown as MatchCandidate[]);
  const matchedIds = new Set(result.matches.map((item) => item.candidateId));
  await signManagedPhotoUrls(rows.filter((row) => matchedIds.has(row.id)), false);
  const publicProfiles = new Map(rows.filter((row) => matchedIds.has(row.id)).map((row) => {
    const profile = profileRowToSpecialist(row);
    delete profile.registeredLat; delete profile.registeredLng; delete profile.streetArea;
    return [profile.id, profile];
  }));
  const exclusions = result.evaluations.filter((item) => !item.matched).reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.reason]: (counts[item.reason] ?? 0) + 1 }), {});
  return NextResponse.json({
    matches: result.matches.map((item) => ({ specialist: publicProfiles.get(item.candidateId), reason: item.reason, distanceKm: Number((item.distanceKm ?? 0).toFixed(1)) })),
    exclusions: exclusions as Record<MatchReason, number>,
    ordering: "relevance_desc,distance_asc,name_asc,id_asc"
  });
}
