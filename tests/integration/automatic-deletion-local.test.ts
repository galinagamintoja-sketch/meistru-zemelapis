import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { processClaimedAccountDeletion } from "../../lib/account-deletion";

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const run = url && key ? describe : describe.skip;
const createdAuthIds: string[] = [];
const createdProfileIds: string[] = [];
const createdRequestIds: string[] = [];
const createdAdminActionIds: string[] = [];

run("local automatic deletion integration", () => {
  const supabase = createClient(url!, key!, { auth: { persistSession: false } });

  afterAll(async () => {
    for (const requestId of createdRequestIds) await supabase.from("account_privacy_requests").delete().eq("id", requestId);
    for (const actionId of createdAdminActionIds) await supabase.from("admin_actions").delete().eq("id", actionId);
    for (const profileId of createdProfileIds) {
      const { data } = await supabase.storage.from("profile-photos").list(profileId, { limit: 100 });
      const paths = (data ?? []).filter((item) => item.id).map((item) => `${profileId}/${item.name}`);
      if (paths.length) await supabase.storage.from("profile-photos").remove(paths);
      await supabase.from("tradesperson_profiles").delete().eq("id", profileId);
    }
    for (const authId of createdAuthIds) {
      await supabase.from("account_privacy_requests").delete().eq("auth_user_id", authId);
      await supabase.from("users").delete().eq("auth_user_id", authId);
      await supabase.auth.admin.deleteUser(authId);
    }
  });

  it("deletes owned Storage, relational data and Auth last while preserving shared taxonomy", async () => {
    const marker = crypto.randomUUID();
    const email = `qa-delete-${marker}@example.lt`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({ email, password: `Qa-${marker}!aA1`, email_confirm: true });
    expect(authError).toBeNull();
    const authId = authData.user!.id;
    createdAuthIds.push(authId);

    const { data: localUser, error: userError } = await supabase.from("users").insert({ auth_user_id: authId, email, email_verified: true, role: "tradesperson" }).select("id").single();
    expect(userError).toBeNull();
    const { data: category } = await supabase.from("service_categories").select("id").eq("is_active", true).limit(1).single();
    const taxonomyBefore = (await supabase.from("service_categories").select("id", { count: "exact", head: true })).count;
    const phone = `+3706${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`;
    const { data: profile, error: profileError } = await supabase.from("tradesperson_profiles").insert({
      user_id: localUser!.id, display_name: `QA delete ${marker}`, phone, email,
      base_city: "Lentvaris", radius_km: 20, service_category_id: category!.id,
      description: "Kontroliuojamas automatinio ištrynimo integracinis profilis, skirtas tik vietiniam testui ir saugiam išvalymui.",
      public_status: "public", approval_status: "approved", public_contact_consent_at: new Date().toISOString()
    }).select("id").single();
    expect(profileError).toBeNull();
    const profileId = profile!.id;
    createdProfileIds.push(profileId);

    await supabase.from("operating_areas").insert({ tradesperson_profile_id: profileId, city: "Lentvaris", radius_km: 20 });
    await supabase.from("profile_category_assignments").insert({ tradesperson_profile_id: profileId, service_category_id: category!.id });
    const paths = [`${profileId}/approved.webp`, `${profileId}/pending.webp`, `${profileId}/abandoned.webp`];
    for (const path of paths) expect((await supabase.storage.from("profile-photos").upload(path, new Uint8Array([1, 2, 3]), { contentType: "image/webp" })).error).toBeNull();
    await supabase.from("profile_photos").insert([
      { tradesperson_profile_id: profileId, storage_path: paths[0], moderation_status: "approved", label: "approved" },
      { tradesperson_profile_id: profileId, storage_path: paths[1], moderation_status: "pending", label: "pending" }
    ]);

    const { data: scheduled, error: scheduleError } = await supabase.rpc("schedule_account_deletion", { p_auth_user_id: authId });
    expect(scheduleError).toBeNull();
    createdRequestIds.push(scheduled[0].request_id);
    const { data: auditRows } = await supabase.from("admin_actions").select("id").eq("tradesperson_profile_id", profileId).eq("action", "account_deletion_scheduled");
    createdAdminActionIds.push(...(auditRows ?? []).map((row) => row.id));
    expect(scheduled[0].profile_hidden).toBe(true);
    expect((await supabase.from("tradesperson_profiles").select("public_status").eq("id", profileId).single()).data?.public_status).toBe("private");
    await supabase.from("account_privacy_requests").update({ scheduled_deletion_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", scheduled[0].request_id);
    const { data: claims, error: claimError } = await supabase.rpc("claim_due_account_deletions", { p_batch_size: 1, p_request_id: scheduled[0].request_id, p_lease_minutes: 15 });
    expect(claimError).toBeNull();
    expect(claims).toHaveLength(1);

    await expect(processClaimedAccountDeletion(supabase as never, claims[0])).resolves.toEqual({ ok: true, storageObjectsRemoved: 3 });
    expect((await supabase.storage.from("profile-photos").list(profileId, { limit: 100 })).data?.filter((item) => item.id)).toHaveLength(0);
    expect((await supabase.from("tradesperson_profiles").select("id", { count: "exact", head: true }).eq("id", profileId)).count).toBe(0);
    expect((await supabase.from("users").select("id", { count: "exact", head: true }).eq("auth_user_id", authId)).count).toBe(0);
    const completed = await supabase.from("account_privacy_requests").select("status,auth_user_id,tradesperson_profile_id,last_error").eq("id", scheduled[0].request_id).single();
    expect(completed.data).toEqual({ status: "completed", auth_user_id: null, tradesperson_profile_id: null, last_error: null });
    expect((await supabase.from("service_categories").select("id", { count: "exact", head: true })).count).toBe(taxonomyBefore);
    expect((await supabase.auth.admin.getUserById(authId)).data.user).toBeNull();
  }, 30_000);

  it("allows only one concurrent worker claim and recovers an expired lease", async () => {
    const marker = crypto.randomUUID();
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({ email: `qa-concurrency-${marker}@example.lt`, password: `Qa-${marker}!aA1`, email_confirm: true });
    expect(authError).toBeNull();
    const authId = authData.user!.id;
    createdAuthIds.push(authId);
    const { data: scheduled } = await supabase.rpc("schedule_account_deletion", { p_auth_user_id: authId });
    const requestId = scheduled[0].request_id;
    createdRequestIds.push(requestId);
    await supabase.from("account_privacy_requests").update({ scheduled_deletion_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", requestId);

    const [first, second] = await Promise.all([
      supabase.rpc("claim_due_account_deletions", { p_batch_size: 1, p_request_id: requestId, p_lease_minutes: 15 }),
      supabase.rpc("claim_due_account_deletions", { p_batch_size: 1, p_request_id: requestId, p_lease_minutes: 15 })
    ]);
    expect(first.error).toBeNull(); expect(second.error).toBeNull();
    expect((first.data?.length ?? 0) + (second.data?.length ?? 0)).toBe(1);

    await supabase.from("account_privacy_requests").update({ lease_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", requestId);
    const retried = await supabase.rpc("claim_due_account_deletions", { p_batch_size: 1, p_request_id: requestId, p_lease_minutes: 15 });
    expect(retried.error).toBeNull();
    expect(retried.data).toHaveLength(1);
    expect(retried.data[0].attempt_count).toBe(2);
  }, 30_000);
});
