import { NextResponse } from "next/server";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";
import { tradespersonProfileUpdateSchema } from "../../../../lib/tradesperson-profile-schema";
import { createServerSupabase } from "../../../../lib/supabase";
import { normalizeLithuanianPhone } from "../../../../lib/phone";
import { isContactNumberConflict, PROFILE_PHONE_CONFLICT } from "../../../../lib/contact-number-conflict";
import { accountMutationBlocked, isSameOrigin } from "../../../../lib/account-deletion";

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const { user, profile } = await requireOwnedProfile();
  if (await accountMutationBlocked(user.id)) return NextResponse.json({ error: "Paskyros ištrynimas suplanuotas. Pakeitimai laikinai išjungti." }, { status: 409 });
  if (!profile) return NextResponse.json({ error: "Profilis nesusietas." }, { status: 403 });
  const parsed = tradespersonProfileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Patikrinkite įvestus duomenis.", details: parsed.error.flatten() }, { status: 400 });

  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Duomenų bazė nepasiekiama." }, { status: 503 });
  const { data: selectedServices } = await supabase.from("profile_services").select("service_subcategory_id").eq("tradesperson_profile_id", profile.id);
  const selectedServiceIds = new Set((selectedServices ?? []).map((service) => service.service_subcategory_id));
  if (parsed.data.serviceLabourRates.some((rate) => !selectedServiceIds.has(rate.serviceId))) return NextResponse.json({ error: "m² kainos gali būti susietos tik su pasirinktomis paslaugomis." }, { status: 400 });
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
    labour_rate_unit: parsed.data.labourRateUnit,
    labour_rate_amount: parsed.data.labourRateUnit === "hour" ? parsed.data.labourRateAmount : null,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from("tradesperson_profiles").update(values).eq("id", profile.id).eq("user_id", await localUserId(user.id, supabase));
  if (error) {
    if (isContactNumberConflict(error)) return NextResponse.json({ error: PROFILE_PHONE_CONFLICT }, { status: 409 });
    return NextResponse.json({ error: "Profilio išsaugoti nepavyko." }, { status: 500 });
  }
  const { error: rateError } = await supabase.rpc("replace_profile_service_labour_rates", {
    target_profile_id: profile.id,
    target_service_ids: parsed.data.serviceLabourRates.map((rate) => rate.serviceId),
    target_amounts: parsed.data.serviceLabourRates.map((rate) => rate.amount)
  });
  if (rateError) return NextResponse.json({ error: "Paslaugų kainų išsaugoti nepavyko." }, { status: 500 });
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
