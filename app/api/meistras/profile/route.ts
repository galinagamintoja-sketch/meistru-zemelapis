import { NextResponse } from "next/server";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";
import { tradespersonProfileUpdateSchema } from "../../../../lib/tradesperson-profile-schema";
import { createServerSupabase } from "../../../../lib/supabase";
import { normalizeLithuanianPhone } from "../../../../lib/phone";
import { isContactNumberConflict, PROFILE_PHONE_CONFLICT } from "../../../../lib/contact-number-conflict";

export async function PATCH(request: Request) {
  const { user, profile } = await requireOwnedProfile();
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });
  const parsed = tradespersonProfileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Patikrinkite įvestus duomenis.", details: parsed.error.flatten() }, { status: 400 });

  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Duomenų bazė nepasiekiama." }, { status: 503 });
  const values = {
    display_name: parsed.data.displayName,
    company_name: parsed.data.companyName || null,
    service_category_id: parsed.data.primaryCategoryId,
    experience_years: parsed.data.experienceYears,
    phone: normalizeLithuanianPhone(parsed.data.phone),
    whatsapp_number: parsed.data.whatsappNumber ? normalizeLithuanianPhone(parsed.data.whatsappNumber) : null,
    email: parsed.data.publicEmail,
    description: parsed.data.description,
    languages: parsed.data.languages,
    public_contact_consent_at: parsed.data.publicContactConsent ? (profile.public_contact_consent_at ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from("tradesperson_profiles").update(values).eq("id", profile.id).eq("user_id", await localUserId(user.id, supabase));
  if (error) {
    if (isContactNumberConflict(error)) return NextResponse.json({ error: PROFILE_PHONE_CONFLICT }, { status: 409 });
    return NextResponse.json({ error: "Profilio išsaugoti nepavyko." }, { status: 500 });
  }
  await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: "tradesperson_profile_updated", notes: "Public profile fields updated by owner", created_by_role: "tradesperson" });
  if (profile.phone !== parsed.data.phone || (profile.whatsapp_number ?? "") !== parsed.data.whatsappNumber || profile.email !== parsed.data.publicEmail) {
    await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: "tradesperson_public_contacts_updated", notes: "Public contact fields updated by owner", created_by_role: "tradesperson" });
  }
  if (Boolean(profile.public_contact_consent_at) !== parsed.data.publicContactConsent) {
    await supabase.from("consent_logs").insert({
      tradesperson_profile_id: profile.id,
      consent_type: "public_contact",
      consent_text: parsed.data.publicContactConsent ? "Sutinku viešai rodyti kontaktinius duomenis." : "Atšaukiu sutikimą viešai rodyti kontaktinius duomenis.",
      captured_channel: "tradesperson-dashboard",
      captured_at: new Date().toISOString()
    });
  }
  return NextResponse.json({ ok: true });
}

async function localUserId(authUserId: string, supabase: NonNullable<ReturnType<typeof createServerSupabase>>) {
  const { data } = await supabase.from("users").select("id").eq("auth_user_id", authUserId).single();
  return data?.id ?? "00000000-0000-0000-0000-000000000000";
}
