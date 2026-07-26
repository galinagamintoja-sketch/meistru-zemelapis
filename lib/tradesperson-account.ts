import { redirect } from "next/navigation";
import { createServerSupabase } from "./supabase";
import { createSupabaseAuthClient } from "./supabase-ssr";

export async function requireTradespersonUser() {
  const auth = await createSupabaseAuthClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) redirect("/login");
  return user;
}

export async function getLinkedTradespersonProfile(authUserId: string) {
  const supabase = createServerSupabase();
  if (!supabase) return null;
  const { data: localUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!localUser) return null;

  const { data } = await supabase
    .from("tradesperson_profiles")
    .select("id,display_name,company_name,phone,whatsapp_number,email,base_city,radius_km,description,service_area_label,public_status,approval_status")
    .eq("user_id", localUser.id)
    .maybeSingle();
  return data;
}

export async function requireOwnedProfile() {
  const user = await requireTradespersonUser();
  const profile = await getLinkedTradespersonProfile(user.id);
  return { user, profile };
}
