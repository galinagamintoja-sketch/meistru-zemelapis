import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
const url = process.env.TAXONOMY_STAGING_URL;
const key = process.env.TAXONOMY_STAGING_SERVICE_KEY;
const email = "qa-taxonomy-browser-20260730@example.invalid";
const registrationEmail = "qa-taxonomy-registration-20260730@example.invalid";
const password = process.env.TAXONOMY_QA_PASSWORD;
if (!url || !key || !password) throw new Error("Missing staging configuration");
const db = createClient(url, key, { auth: { persistSession: false } });

async function cleanup() {
  const { data: users } = await db.auth.admin.listUsers();
  const authUsers = users?.users.filter((user) => user.email === email || user.email === registrationEmail) ?? [];
  const { data: localUser } = await db.from("users").select("id").eq("email", email).maybeSingle();
  await db.from("tradesperson_profiles").delete().eq("email", email);
  if (localUser) await db.from("users").delete().eq("id", localUser.id);
  for (const authUser of authUsers) await db.auth.admin.deleteUser(authUser.id);
}

async function setup() {
  await cleanup();
  const { data: created, error: authError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (authError || !created.user) throw authError ?? new Error("Auth user not created");
  const { error: registrationAuthError } = await db.auth.admin.createUser({
    email: registrationEmail, password, email_confirm: true
  });
  if (registrationAuthError) throw registrationAuthError;
  const { data: localUser, error: userError } = await db.from("users").insert({
    auth_user_id: created.user.id, email, email_verified: true, role: "tradesperson"
  }).select("id").single();
  if (userError) throw userError;
  const { data: assignments, error: assignmentError } = await db
    .from("service_category_assignments")
    .select("service_category_id,service_subcategory_id,service_subcategories(is_active)");
  if (assignmentError) throw assignmentError;
  const { data: activeCategories, error: categoryError } = await db.from("service_categories").select("id,slug").eq("is_active", true);
  if (categoryError) throw categoryError;
  const activeCategoryIds = new Set(activeCategories.map((category) => category.id));
  const priorityCategorySlugs = ["vidaus-apdaila", "langai-durys-laiptai", "santechnika"];
  const categoryIds = priorityCategorySlugs.map((slug) => activeCategories.find((category) => category.slug === slug)?.id);
  if (categoryIds.some((id) => !id)) throw new Error("Missing priority staging category");
  const serviceIds = [];
  for (const row of assignments) {
    if (!row.service_subcategories?.is_active || !activeCategoryIds.has(row.service_category_id)) continue;
    if (categoryIds.includes(row.service_category_id) && !serviceIds.includes(row.service_subcategory_id)) serviceIds.push(row.service_subcategory_id);
    if (serviceIds.length >= 25) break;
  }
  if (serviceIds.length !== 25) throw new Error("Could not select 25 staging services");
  const { data: profile, error: profileError } = await db.from("tradesperson_profiles").insert({
    user_id: localUser.id, display_name: "QA Taxonomy Browser", phone: "+37060000004", email,
    base_city: "Vilnius", radius_km: 150, service_category_id: categoryIds[0],
    registered_address: "QA test address, Vilnius", google_place_id: "qa-taxonomy-browser",
    latitude: 54.6872, longitude: 25.2797,
    description: "Kontroliuojamas laikinas profilis kategorijų ir paslaugų naršyklės patikrai.",
    public_status: "private", approval_status: "pending", source: "admin-created",
    public_contact_consent_at: new Date().toISOString()
  }).select("id").single();
  if (profileError) throw profileError;
  const { error: rpcError } = await db.rpc("replace_tradesperson_services", {
    target_profile_id: profile.id, target_category_ids: categoryIds, target_subcategory_ids: serviceIds
  });
  if (rpcError) throw rpcError;
  console.log(JSON.stringify({ email, registrationEmail, profileId: profile.id, categoryIds, serviceIds }));
}

await (mode === "setup" ? setup() : cleanup());
