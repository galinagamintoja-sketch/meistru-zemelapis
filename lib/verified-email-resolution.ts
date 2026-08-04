import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "./supabase";
import { createSupabaseAuthClient } from "./supabase-ssr";

export type AccountResolution = {
  outcome: string;
  candidateCount: number;
  linked: boolean;
};

function verifiedEmail(user: User) {
  if (!user.email || !user.email_confirmed_at) return null;
  const supportedIdentity = (user.identities ?? []).some((identity) =>
    identity.provider === "google" || identity.provider === "email"
  );
  return supportedIdentity ? user.email.trim().toLowerCase() : null;
}

async function resolveVerifiedEmailAccount(confirm: boolean): Promise<AccountResolution> {
  const auth = await createSupabaseAuthClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) return { outcome: "unauthenticated", candidateCount: 0, linked: false };

  const email = verifiedEmail(user);
  if (!email) return { outcome: "unverified_email", candidateCount: 0, linked: false };

  const supabase = createServerSupabase();
  if (!supabase) return { outcome: "unavailable", candidateCount: 0, linked: false };
  const { data, error: rpcError } = await supabase.rpc("resolve_verified_email_account", {
    p_auth_user_id: user.id,
    p_email: email,
    p_confirm: confirm
  });
  if (rpcError) throw new Error("Account resolution failed");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    outcome: String(row?.outcome ?? "unavailable"),
    candidateCount: Number(row?.candidate_count ?? 0),
    linked: Boolean(row?.linked)
  };
}

export const inspectVerifiedEmailResolution = () => resolveVerifiedEmailAccount(false);
export const confirmVerifiedEmailResolution = () => resolveVerifiedEmailAccount(true);

