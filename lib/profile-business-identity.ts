import { createServerSupabase } from "./supabase";
import type { Specialist } from "./types";

type VerificationRow = { verified_name: string; verified_at: string; revoked_at: string | null };

export function applyBusinessVerification(profile: Specialist, row: VerificationRow | null): Specialist {
  // Always discard any caller-supplied projection before consulting trusted evidence.
  const { verifiedBusiness: _untrusted, ...safe } = profile;
  void _untrusted;
  if (!row || row.revoked_at || !row.verified_name.trim() ||
      row.verified_name.trim() !== profile.companyName?.trim() ||
      !Number.isFinite(Date.parse(row.verified_at)) || Date.parse(row.verified_at) > Date.now()) return safe;
  return { ...safe, verifiedBusiness: { name: row.verified_name.trim(), verifiedAt: row.verified_at } };
}

export async function withVerifiedBusinessIdentity(profile: Specialist) {
  const db = createServerSupabase();
  if (!db || !profile.companyName?.trim()) return applyBusinessVerification(profile, null);
  try {
    const { data, error } = await db.from("profile_business_verifications")
      .select("verified_name,verified_at,revoked_at").eq("profile_id", profile.id).maybeSingle();
    // Missing migration, revoked proof or database failure never promotes a profile to a business.
    return applyBusinessVerification(profile, error ? null : data);
  } catch {
    return applyBusinessVerification(profile, null);
  }
}
