import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "./supabase";

type ServerSupabase = NonNullable<ReturnType<typeof createServerSupabase>>;

export const ACTIVE_DELETION_STATUSES = ["pending", "processing", "failed"] as const;

export type AccountDeletionState = {
  id: string;
  status: "pending" | "processing" | "failed";
  scheduledDeletionAt: string | null;
  attemptCount: number;
  lastError: string | null;
};

export async function getActiveAccountDeletion(authUserId: string, supabase = createServerSupabase()) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("account_privacy_requests")
    .select("id,status,scheduled_deletion_at,attempt_count,last_error")
    .eq("auth_user_id", authUserId)
    .eq("request_type", "account_deletion")
    .in("status", [...ACTIVE_DELETION_STATUSES])
    .maybeSingle();
  if (error) throw new Error("account_deletion_state_unavailable");
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    scheduledDeletionAt: data.scheduled_deletion_at,
    attemptCount: data.attempt_count ?? 0,
    lastError: data.last_error
  } as AccountDeletionState;
}

export async function accountMutationBlocked(authUserId: string) {
  return Boolean(await getActiveAccountDeletion(authUserId));
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export function loginEmailMatches(user: User, submitted: string) {
  return Boolean(user.email && user.email.trim().toLowerCase() === submitted.trim().toLowerCase());
}

type ClaimedDeletion = {
  request_id: string;
  auth_user_id: string;
  tradesperson_profile_id: string | null;
  claim_token: string;
  attempt_count: number;
};

async function listProfileStoragePaths(supabase: ServerSupabase, profileId: string) {
  const paths: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from("profile-photos").list(profileId, {
      limit: 100, offset, sortBy: { column: "name", order: "asc" }
    });
    if (error) throw new Error("storage_list_failed");
    const objects = (data ?? []).filter((item) => item.name && item.id);
    paths.push(...objects.map((item) => `${profileId}/${item.name}`));
    if ((data ?? []).length < 100) break;
    offset += 100;
  }
  return paths;
}

async function removeOwnedProfileStorage(supabase: ServerSupabase, profileId: string) {
  const paths = await listProfileStoragePaths(supabase, profileId);
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await supabase.storage.from("profile-photos").remove(paths.slice(index, index + 100));
    if (error) throw new Error("storage_delete_failed");
  }
  const remaining = await listProfileStoragePaths(supabase, profileId);
  if (remaining.length) throw new Error("storage_verification_failed");
  return paths.length;
}

function safeDeletionError(error: unknown) {
  if (error instanceof Error && /^[a-z0-9_]{1,80}$/.test(error.message)) return error.message;
  return "deletion_failed";
}

export async function processClaimedAccountDeletion(supabase: ServerSupabase, claim: ClaimedDeletion) {
  try {
    const storageObjectsRemoved = claim.tradesperson_profile_id
      ? await removeOwnedProfileStorage(supabase, claim.tradesperson_profile_id)
      : 0;

    const { data: applicationData, error: applicationError } = await supabase.rpc("delete_account_application_data", {
      p_request_id: claim.request_id,
      p_claim_token: claim.claim_token
    });
    if (applicationError) throw new Error("database_cleanup_failed");
    const result = Array.isArray(applicationData) ? applicationData[0] : applicationData;
    const authUserId = result?.auth_user_id ?? claim.auth_user_id;

    const { error: authError } = await supabase.auth.admin.deleteUser(authUserId);
    if (authError && !/not found|does not exist/i.test(authError.message ?? "")) {
      throw new Error("auth_delete_failed");
    }

    const { data: completed, error: completionError } = await supabase.rpc("complete_account_deletion", {
      p_request_id: claim.request_id,
      p_claim_token: claim.claim_token
    });
    if (completionError || completed !== true) throw new Error("completion_state_failed");
    return { ok: true as const, storageObjectsRemoved };
  } catch (error) {
    const safeError = safeDeletionError(error);
    await supabase.rpc("fail_account_deletion", {
      p_request_id: claim.request_id,
      p_claim_token: claim.claim_token,
      p_safe_error: safeError
    });
    return { ok: false as const, error: safeError, storageObjectsRemoved: 0 };
  }
}

export async function claimAndProcessAccountDeletions(options: { requestId?: string; batchSize?: number } = {}) {
  const supabase = createServerSupabase();
  if (!supabase) throw new Error("database_unavailable");
  const { data, error } = await supabase.rpc("claim_due_account_deletions", {
    p_batch_size: options.requestId ? 1 : Math.min(Math.max(options.batchSize ?? 10, 1), 50),
    p_request_id: options.requestId ?? null,
    p_lease_minutes: 15
  });
  if (error) throw new Error("worker_claim_failed");
  const claims = (data ?? []) as ClaimedDeletion[];
  const results = [];
  for (const claim of claims) results.push(await processClaimedAccountDeletion(supabase, claim));
  return {
    claimed: claims.length,
    completed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    storageObjectsRemoved: results.reduce((sum, item) => sum + item.storageObjectsRemoved, 0)
  };
}
