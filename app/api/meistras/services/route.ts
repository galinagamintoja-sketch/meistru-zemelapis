import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";
import { tradespersonServicesUpdateSchema } from "../../../../lib/tradesperson-profile-schema";

export async function PUT(request: Request) {
  const { profile } = await requireOwnedProfile();
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });
  const parsed = tradespersonServicesUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neteisingas paslaugų sąrašas." }, { status: 400 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Duomenų bazė nepasiekiama." }, { status: 503 });

  const { data: allowed } = await supabase.from("service_subcategories").select("id,service_category_id").in("id", parsed.data.subcategoryIds).eq("is_active", true);
  if ((allowed?.length ?? 0) !== parsed.data.subcategoryIds.length) return NextResponse.json({ error: "Pasirinkta neaktyvi paslauga." }, { status: 400 });
  const { error: deleteError } = await supabase.from("profile_services").delete().eq("tradesperson_profile_id", profile.id);
  if (deleteError) return NextResponse.json({ error: "Paslaugų išsaugoti nepavyko." }, { status: 500 });
  if (allowed?.length) {
    const { error } = await supabase.from("profile_services").insert(allowed.map((item) => ({ tradesperson_profile_id: profile.id, service_category_id: item.service_category_id, service_subcategory_id: item.id })));
    if (error) return NextResponse.json({ error: "Paslaugų išsaugoti nepavyko." }, { status: 500 });
  }
  await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: "tradesperson_services_updated", notes: `${allowed?.length ?? 0} services selected`, created_by_role: "tradesperson" });
  return NextResponse.json({ ok: true });
}
