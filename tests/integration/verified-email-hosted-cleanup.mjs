import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Hosted development Supabase environment is required");
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;
const qaUsers = listed.data.users.filter((user) => String(user.user_metadata?.qa_marker ?? "").startsWith("qa-email-resolution-"));
const authIds = qaUsers.map((user) => user.id);

const profiles = await db.from("tradesperson_profiles").select("id").like("display_name", "qa-email-resolution-%");
if (profiles.error) throw profiles.error;
if (profiles.data.length) {
  const removed = await db.from("tradesperson_profiles").delete().in("id", profiles.data.map((row) => row.id));
  if (removed.error) throw removed.error;
}
if (authIds.length) {
  const audits = await db.from("account_resolution_audit").delete().in("auth_user_id", authIds);
  if (audits.error && audits.error.code !== "PGRST205") throw audits.error;
  const users = await db.from("users").delete().in("auth_user_id", authIds);
  if (users.error) throw users.error;
  for (const id of authIds) {
    const removed = await db.auth.admin.deleteUser(id);
    if (removed.error) throw removed.error;
  }
}

const profileProof = await db.from("tradesperson_profiles").select("id", { count: "exact", head: true }).like("display_name", "qa-email-resolution-%");
const auditProof = authIds.length ? await db.from("account_resolution_audit").select("auth_user_id", { count: "exact", head: true }).in("auth_user_id", authIds) : { count: 0, error: null };
const userProof = authIds.length ? await db.from("users").select("id", { count: "exact", head: true }).in("auth_user_id", authIds) : { count: 0, error: null };
if (profileProof.error || (auditProof.error && auditProof.error.code !== "PGRST205") || userProof.error) throw new Error("Cleanup proof failed");
process.stdout.write(`${JSON.stringify({ removedAuthUsers: authIds.length, remainingProfiles: profileProof.count, remainingAudits: auditProof.error?.code === "PGRST205" ? "table-not-installed" : auditProof.count, remainingLocalUsers: userProof.count })}\n`);
