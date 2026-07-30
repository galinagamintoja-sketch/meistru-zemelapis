import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";
import { tradespersonServicesUpdateSchema } from "../../../../lib/tradesperson-profile-schema";
import { MAX_PROFILE_CATEGORIES, MAX_PROFILE_SERVICES } from "../../../../lib/service-taxonomy";

export async function PUT(request: Request) {
  const { profile } = await requireOwnedProfile();
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });
  const parsed = tradespersonServicesUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neteisingas paslaugų sąrašas." }, { status: 400 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Duomenų bazė nepasiekiama." }, { status: 503 });

  const { data: allowed } = await supabase.from("service_subcategories").select("id,service_category_id").in("id", parsed.data.subcategoryIds).eq("is_active", true);
  if ((allowed?.length ?? 0) !== parsed.data.subcategoryIds.length) return NextResponse.json({ error: "Pasirinkta neaktyvi paslauga." }, { status: 400 });
  const { data: assignments, error: assignmentError } = await supabase
    .from("service_category_assignments")
    .select("service_category_id")
    .in("service_subcategory_id", parsed.data.subcategoryIds);
  const workAreaIds = !assignmentError && assignments?.length
    ? assignments.map((item) => item.service_category_id)
    : (allowed ?? []).map((item) => item.service_category_id);
  if (new Set(parsed.data.subcategoryIds).size > MAX_PROFILE_SERVICES) return NextResponse.json({ error: `Pasiekėte ${MAX_PROFILE_SERVICES} paslaugų limitą.` }, { status: 400 });
  if (new Set(workAreaIds).size > MAX_PROFILE_CATEGORIES) return NextResponse.json({ error: `Pasiekėte ${MAX_PROFILE_CATEGORIES} darbo sričių limitą.` }, { status: 400 });
  const { error } = await supabase.rpc("replace_tradesperson_services", {
    target_profile_id: profile.id,
    target_subcategory_ids: parsed.data.subcategoryIds
  });
  if (error) return NextResponse.json({ error: "Paslaugų išsaugoti nepavyko." }, { status: 500 });
  await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: "tradesperson_services_updated", notes: `${allowed?.length ?? 0} services selected`, created_by_role: "tradesperson" });
  return NextResponse.json({ ok: true });
}
