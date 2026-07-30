import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";
import { tradespersonServicesUpdateSchema } from "../../../../lib/tradesperson-profile-schema";

export async function PUT(request: Request) {
  const { profile } = await requireOwnedProfile();
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });
  const parsed = tradespersonServicesUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neteisingas darbo sričių arba paslaugų sąrašas." }, { status: 400 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Duomenų bazė nepasiekiama." }, { status: 503 });

  const { data: categories } = await supabase
    .from("service_categories")
    .select("id")
    .in("id", parsed.data.categoryIds)
    .eq("is_active", true);
  if ((categories?.length ?? 0) !== parsed.data.categoryIds.length) {
    return NextResponse.json({ error: "Pasirinkta neaktyvi darbo sritis." }, { status: 400 });
  }

  const { data: allowed } = await supabase
    .from("service_subcategories")
    .select("id,service_category_id")
    .in("id", parsed.data.subcategoryIds)
    .eq("is_active", true);
  if ((allowed?.length ?? 0) !== parsed.data.subcategoryIds.length) {
    return NextResponse.json({ error: "Pasirinkta neaktyvi paslauga." }, { status: 400 });
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("service_category_assignments")
    .select("service_subcategory_id,service_category_id")
    .in("service_subcategory_id", parsed.data.subcategoryIds);
  const selectedCategoryIds = new Set(parsed.data.categoryIds);
  const serviceFitsSelection = (service: { id: string; service_category_id: string }) => {
    const categoryIds = !assignmentError
      ? (assignments ?? [])
        .filter((assignment) => assignment.service_subcategory_id === service.id)
        .map((assignment) => assignment.service_category_id)
      : [service.service_category_id];
    return categoryIds.some((categoryId) => selectedCategoryIds.has(categoryId));
  };
  if ((allowed ?? []).some((service) => !serviceFitsSelection(service))) {
    return NextResponse.json({ error: "Pasirinkta paslauga nepriklauso pasirinktoms darbo sritims." }, { status: 400 });
  }

  const { error } = await supabase.rpc("replace_tradesperson_services", {
    target_profile_id: profile.id,
    target_category_ids: parsed.data.categoryIds,
    target_subcategory_ids: parsed.data.subcategoryIds
  });
  if (error) return NextResponse.json({ error: "Paslaugų išsaugoti nepavyko." }, { status: 500 });
  await supabase.from("admin_actions").insert({
    tradesperson_profile_id: profile.id,
    action: "tradesperson_services_updated",
    notes: `${parsed.data.categoryIds.length} work areas and ${allowed?.length ?? 0} services selected`,
    created_by_role: "tradesperson"
  });
  return NextResponse.json({ ok: true });
}
