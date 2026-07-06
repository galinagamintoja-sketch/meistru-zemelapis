import { NextResponse } from "next/server";
import { registrationSchema } from "../../../../lib/validators";
import { createServerSupabase, hasSupabaseConfig } from "../../../../lib/supabase";

export async function POST(request: Request) {
  const parsed = registrationSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Patikrinkite registracijos laukus", details: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const supabase = createServerSupabase();

  if (!supabase) {
    return NextResponse.json({
      ok: true,
      mode: "seed",
      message: "Registracija priimta demonstraciniu režimu. Prijungus Supabase, profilis bus saugomas duomenų bazėje.",
      profile: {
        id: `pending-${Date.now()}`,
        approvalStatus: "pending",
        source: "self-registration"
      }
    });
  }

  const category = await supabase
    .from("service_categories")
    .select("id")
    .eq("name", payload.trade)
    .maybeSingle();

  const { data: profile, error } = await supabase
    .from("tradesperson_profiles")
    .insert({
      display_name: payload.name,
      phone: payload.phone,
      whatsapp_number: payload.whatsapp || payload.phone,
      email: payload.email,
      base_city: payload.city,
      radius_km: payload.radiusKm,
      description: payload.description,
      service_category_id: category.data?.id ?? null,
      public_status: "private",
      approval_status: "pending",
      source: "self-registration",
      consent_at: new Date().toISOString(),
      verification_labels: []
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("operating_areas").insert(
    payload.operatingCities.map((city) => ({
      tradesperson_profile_id: profile.id,
      city,
      radius_km: payload.radiusKm
    }))
  );

  await supabase.from("consent_logs").insert({
    tradesperson_profile_id: profile.id,
    consent_type: "self_registration_publish_review",
    consent_text: "Tradesperson submitted LocalPro registration and agreed to admin review before publishing.",
    captured_channel: "website",
    captured_at: new Date().toISOString()
  });

  await supabase.from("admin_actions").insert({
    tradesperson_profile_id: profile.id,
    action: "profile_submitted",
    notes: "New self-registration awaits admin approval.",
    created_by_role: "system"
  });

  return NextResponse.json({
    ok: true,
    mode: hasSupabaseConfig() ? "database" : "seed",
    profile: {
      id: profile.id,
      approvalStatus: "pending",
      source: "self-registration"
    }
  });
}
