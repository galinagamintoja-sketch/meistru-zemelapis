import type { createServerSupabase } from "./supabase";
import { cleanText } from "./profile-write-service";
import { isLithuanianPhone } from "./validators";

type ServerSupabase = NonNullable<ReturnType<typeof createServerSupabase>>;

type PublicationValidationOptions = {
  requireAllActivePhotosApproved?: boolean;
};

export async function validateProfileForPublication(
  supabase: ServerSupabase,
  id: string,
  options: PublicationValidationOptions = {}
) {
  const errors: string[] = [];
  const { data: profile, error } = await supabase
    .from("tradesperson_profiles")
    .select(`
      display_name,
      company_name,
      phone,
      service_category_id,
      description,
      public_contact_consent_at,
      operating_areas(city, radius_km),
      profile_services(service_subcategory_id),
      profile_photos(moderation_status, removed_from_profile_at)
    `)
    .eq("id", id)
    .single();

  if (error || !profile) return ["Profilis nerastas."];

  if (!cleanText(profile.display_name) && !cleanText(profile.company_name)) {
    errors.push("Trūksta asmens arba įmonės pavadinimo.");
  }
  if (!isLithuanianPhone(String(profile.phone ?? ""))) {
    errors.push("Trūksta galiojančio telefono numerio.");
  }
  if (!profile.service_category_id) {
    errors.push("Trūksta pagrindinės darbo srities.");
  }

  const operatingAreas = (profile.operating_areas ?? []) as Array<{ city?: string | null; radius_km?: number | null }>;
  if (!operatingAreas.some((area) => cleanText(area.city).length >= 2 && Number(area.radius_km) > 0)) {
    errors.push("Trūksta aptarnavimo miesto ir spindulio.");
  }

  const services = (profile.profile_services ?? []) as Array<{ service_subcategory_id?: string | null }>;
  if (services.filter((service) => service.service_subcategory_id).length < 2) {
    errors.push("Reikia bent 2 konkrečių paslaugų žymų.");
  }
  if (cleanText(profile.description).length < 80) {
    errors.push("Aprašymas turi būti bent 80 simbolių.");
  }
  if (!profile.public_contact_consent_at) {
    errors.push("Trūksta aiškaus sutikimo viešai rodyti kontaktus.");
  }

  const photos = (profile.profile_photos ?? []) as Array<{ moderation_status?: string | null; removed_from_profile_at?: string | null }>;
  if (options.requireAllActivePhotosApproved !== false && photos.some((photo) => !photo.removed_from_profile_at && photo.moderation_status !== "approved")) {
    errors.push("Visos rodomos nuotraukos turi būti patvirtintos arba pašalintos iš profilio.");
  }

  return errors;
}
