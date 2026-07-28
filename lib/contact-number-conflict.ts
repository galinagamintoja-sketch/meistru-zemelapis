export const SELF_REGISTRATION_PHONE_CONFLICT =
  "Šis telefono numeris jau naudojamas kitame LocalPro profilyje. Naujas profilis nebuvo sukurtas. Prisijunkite prie esamos paskyros arba susisiekite su LocalPro pagalba.";

export const PROFILE_PHONE_CONFLICT =
  "Šis telefono numeris jau naudojamas kitame LocalPro profilyje.";

type DatabaseError = { code?: string; message?: string; details?: string; constraint?: string };

export function isContactNumberConflict(error: DatabaseError | null | undefined) {
  if (!error) return false;
  return error.code === "23505" && /contact_number_claims|normalized_number|contact number/i.test(
    [error.message, error.details, error.constraint].filter(Boolean).join(" ")
  );
}

export function conflictingProfileId(error: DatabaseError | null | undefined) {
  const match = error?.details?.match(/profile_id=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}
