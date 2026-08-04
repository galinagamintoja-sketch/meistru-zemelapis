import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Hosted development Supabase environment is required");
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const marker = `qa-email-resolution-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const authIds = [];
const emails = [];
const results = {};
let phoneCounter = 1000000;

function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function authUser(label, confirmed = true) {
  const email = `${marker}-${label}@example.invalid`;
  const data = must(await db.auth.admin.createUser({
    email,
    password: `Qa-${crypto.randomBytes(18).toString("base64url")}!`,
    email_confirm: confirmed,
    user_metadata: { qa_marker: marker }
  }), `create auth ${label}`);
  authIds.push(data.user.id);
  emails.push(email);
  return { id: data.user.id, email };
}

async function profile(label, email, userId = null) {
  const row = must(await db.from("tradesperson_profiles").insert({
    user_id: userId,
    display_name: `${marker}-${label}`,
    phone: `+3706${phoneCounter++}`,
    email,
    base_city: "Vilnius",
    public_status: "private",
    approval_status: "pending",
    source: "admin-created"
  }).select("id,user_id").single(), `create profile ${label}`);
  return row;
}

async function localUser(auth, email) {
  return must(await db.from("users").insert({ auth_user_id: auth.id, email, email_verified: true })
    .select("id").single(), "create local user");
}

async function resolve(auth, email, confirm) {
  const rows = must(await db.rpc("resolve_verified_email_account", {
    p_auth_user_id: auth.id,
    p_email: email,
    p_confirm: confirm
  }), "resolve account");
  return rows[0];
}

try {
  const google = await authUser("a-google");
  const googleProfile = await profile("a", `  ${google.email.toUpperCase()}  `);
  const aInspect = await resolve(google, google.email, false);
  const aConfirm = await resolve(google, google.email, true);
  const aRepeat = await resolve(google, google.email, true);
  const aOwned = must(await db.from("tradesperson_profiles").select("id,user_id").eq("id", googleProfile.id).single(), "A ownership");
  const aUsers = must(await db.from("users").select("id").eq("auth_user_id", google.id), "A users");
  results.A = { inspect: aInspect.outcome, confirm: aConfirm.outcome, repeat: aRepeat.outcome, userCount: aUsers.length, linked: Boolean(aOwned.user_id) };

  const emailAuth = await authUser("b-email");
  const emailProfile = await profile("b", emailAuth.email);
  const bInspect = await resolve(emailAuth, emailAuth.email, false);
  const bConfirm = await resolve(emailAuth, emailAuth.email, true);
  const bRepeat = await resolve(emailAuth, emailAuth.email, true);
  const bOwned = must(await db.from("tradesperson_profiles").select("user_id").eq("id", emailProfile.id).single(), "B ownership");
  results.B = { inspect: bInspect.outcome, confirm: bConfirm.outcome, repeat: bRepeat.outcome, linked: Boolean(bOwned.user_id) };

  const unverified = await authUser("c-unverified", false);
  results.C = { authConfirmedAt: must(await db.auth.admin.getUserById(unverified.id), "C auth").user.email_confirmed_at ?? null, databaseResolverNotInvoked: true };

  const noMatch = await authUser("d-no-match");
  const dResult = await resolve(noMatch, noMatch.email, false);
  const dUsers = must(await db.from("users").select("id").eq("auth_user_id", noMatch.id), "D users");
  results.D = { outcome: dResult.outcome, linkedUserCount: dUsers.length };

  const ambiguous = await authUser("e-ambiguous");
  const e1 = await profile("e1", ambiguous.email);
  const e2 = await profile("e2", ` ${ambiguous.email.toUpperCase()} `);
  const eResult = await resolve(ambiguous, ambiguous.email, true);
  const eRows = must(await db.from("tradesperson_profiles").select("id,user_id").in("id", [e1.id, e2.id]), "E ownership");
  results.E = { outcome: eResult.outcome, candidateCount: eResult.candidate_count, linkedCount: eRows.filter((row) => row.user_id).length };

  const ownerF = await authUser("f-owner");
  const attackerF = await authUser("f-other");
  const ownerFLocal = await localUser(ownerF, ownerF.email);
  const fProfile = await profile("f", attackerF.email, ownerFLocal.id);
  const fResult = await resolve(attackerF, attackerF.email, true);
  const fOwned = must(await db.from("tradesperson_profiles").select("user_id").eq("id", fProfile.id).single(), "F ownership");
  results.F = { outcome: fResult.outcome, unchanged: fOwned.user_id === ownerFLocal.id };

  const ownerG = await authUser("g-owner");
  const ownerGLocal = await localUser(ownerG, ownerG.email);
  const gOwned = await profile("g-owned", `${marker}-g-public@example.invalid`, ownerGLocal.id);
  const gSecond = await profile("g-second", ownerG.email);
  const gResult = await resolve(ownerG, ownerG.email, true);
  const gRows = must(await db.from("tradesperson_profiles").select("id,user_id").in("id", [gOwned.id, gSecond.id]), "G ownership");
  results.G = { outcome: gResult.outcome, ownedCount: gRows.filter((row) => row.user_id === ownerGLocal.id).length, secondStillUnowned: !gRows.find((row) => row.id === gSecond.id)?.user_id };

  const concurrent1 = await authUser("h-one");
  const concurrent2 = await authUser("h-two");
  const sharedEmail = `${marker}-h-shared@example.invalid`;
  const hProfile = await profile("h", sharedEmail);
  const [h1, h2] = await Promise.all([resolve(concurrent1, sharedEmail, true), resolve(concurrent2, sharedEmail, true)]);
  const hOwned = must(await db.from("tradesperson_profiles").select("user_id").eq("id", hProfile.id).single(), "H ownership");
  const hUsers = must(await db.from("users").select("id,auth_user_id").in("auth_user_id", [concurrent1.id, concurrent2.id]), "H users");
  results.H = { outcomes: [h1.outcome, h2.outcome].sort(), linkedUserCount: hUsers.length, profileLinkedToCreatedUser: hUsers.some((row) => row.id === hOwned.user_id) };

  const audits = must(await db.from("account_resolution_audit").select("auth_user_id,outcome,candidate_count,created_at").in("auth_user_id", authIds), "audit rows");
  results.audit = { rowCount: audits.length, fields: [...new Set(audits.flatMap((row) => Object.keys(row)))].sort() };
  process.stdout.write(`${JSON.stringify({ marker, results }, null, 2)}\n`);
} finally {
  const foundProfiles = must(await db.from("tradesperson_profiles").select("id").like("display_name", `${marker}%`), "find profiles for cleanup");
  if (foundProfiles.length) must(await db.from("tradesperson_profiles").delete().in("id", foundProfiles.map((row) => row.id)), "delete profiles");
  if (authIds.length) {
    must(await db.from("account_resolution_audit").delete().in("auth_user_id", authIds), "delete audits");
    must(await db.from("users").delete().in("auth_user_id", authIds), "delete local users");
    for (const id of authIds) must(await db.auth.admin.deleteUser(id), "delete auth user");
  }
  const profileProof = await db.from("tradesperson_profiles").select("id", { count: "exact", head: true }).like("display_name", `${marker}%`);
  const auditProof = authIds.length ? await db.from("account_resolution_audit").select("auth_user_id", { count: "exact", head: true }).in("auth_user_id", authIds) : { count: 0, error: null };
  const userProof = authIds.length ? await db.from("users").select("id", { count: "exact", head: true }).in("auth_user_id", authIds) : { count: 0, error: null };
  if (profileProof.error || auditProof.error || userProof.error) throw new Error("Cleanup proof query failed");
  process.stdout.write(`${JSON.stringify({ cleanup: { profiles: profileProof.count, audits: auditProof.count, users: userProof.count, authUsersDeleted: authIds.length } })}\n`);
}
