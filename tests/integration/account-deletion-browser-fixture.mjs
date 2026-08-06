import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase environment is required");
const supabase = createClient(url, key, { auth: { persistSession: false } });
const email = "qa-browser-delete@example.lt";
const password = "Qa-browser-delete-2026!";

async function cleanup() {
  const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const authUser of users.data.users.filter((item) => item.email === email)) {
    const local = await supabase.from("users").select("id").eq("auth_user_id", authUser.id).maybeSingle();
    if (local.data) {
      const profiles = await supabase.from("tradesperson_profiles").select("id").eq("user_id", local.data.id);
      for (const profile of profiles.data ?? []) {
        const objects = await supabase.storage.from("profile-photos").list(profile.id, { limit: 100 });
        const paths = (objects.data ?? []).filter((item) => item.id).map((item) => `${profile.id}/${item.name}`);
        if (paths.length) await supabase.storage.from("profile-photos").remove(paths);
        await supabase.from("admin_actions").delete().eq("tradesperson_profile_id", profile.id);
        await supabase.from("account_privacy_requests").delete().eq("tradesperson_profile_id", profile.id);
        await supabase.from("tradesperson_profiles").delete().eq("id", profile.id);
      }
      await supabase.from("users").delete().eq("id", local.data.id);
    }
    await supabase.from("account_privacy_requests").delete().eq("auth_user_id", authUser.id);
    await supabase.auth.admin.deleteUser(authUser.id);
  }
}

if (process.argv[2] === "cleanup") {
  await cleanup();
  process.exit(0);
}

await cleanup();
const auth = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (auth.error || !auth.data.user) throw new Error("fixture_auth_failed");
const local = await supabase.from("users").insert({ auth_user_id: auth.data.user.id, email, email_verified: true, role: "tradesperson" }).select("id").single();
if (local.error) throw new Error("fixture_user_failed");
const categories = await supabase.from("service_categories").select("id").eq("is_active", true).limit(1);
const categoryId = categories.data?.[0]?.id;
const subcategories = await supabase.from("service_subcategories").select("id,service_category_id").eq("is_active", true).limit(2);
if (!categoryId || (subcategories.data?.length ?? 0) < 2) throw new Error("fixture_taxonomy_failed");
const profile = await supabase.from("tradesperson_profiles").insert({
  user_id: local.data.id, display_name: "QA Browser Delete", phone: "+37069999998", email,
  base_city: "Lentvaris", radius_km: 25, service_category_id: categoryId,
  description: "Kontroliuojamas naršyklės profilis turi pakankamai išsamų aprašymą automatinio ištrynimo ir atšaukimo patikrai.",
  public_status: "public", approval_status: "approved", public_contact_consent_at: new Date().toISOString()
}).select("id").single();
if (profile.error) throw new Error("fixture_profile_failed");
await supabase.from("operating_areas").insert({ tradesperson_profile_id: profile.data.id, city: "Lentvaris", radius_km: 25 });
await supabase.from("profile_services").insert(subcategories.data.map((item) => ({ tradesperson_profile_id: profile.data.id, service_category_id: item.service_category_id, service_subcategory_id: item.id })));
await supabase.from("profile_category_assignments").insert({ tradesperson_profile_id: profile.data.id, service_category_id: categoryId });
process.stdout.write(JSON.stringify({ email, password }));
