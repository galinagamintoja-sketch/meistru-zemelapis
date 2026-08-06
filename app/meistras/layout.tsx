import { TradespersonShell } from "../../components/tradesperson-shell";
import { requireOwnedProfile } from "../../lib/tradesperson-account";
import { createServerSupabase } from "../../lib/supabase";
import { getActiveAccountDeletion } from "../../lib/account-deletion";

export default async function TradespersonLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireOwnedProfile();
  const name = String(profile?.display_name ?? user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Meistras");
  const supabase = createServerSupabase();
  const deletion = await getActiveAccountDeletion(user.id, supabase);
  const [{ data: category }, { data: photo }] = profile && supabase ? await Promise.all([
    profile.service_category_id
      ? supabase.from("service_categories").select("name").eq("id", profile.service_category_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profile_photos").select("url,storage_path").eq("tradesperson_profile_id", profile.id).eq("moderation_status", "approved").is("removed_from_profile_at", null).order("is_primary", { ascending: false }).order("sort_order").limit(1).maybeSingle()
  ]) : [{ data: null }, { data: null }];
  const photoUrl = photo?.url ?? (photo?.storage_path && supabase
    ? (await supabase.storage.from("profile-photos").createSignedUrl(photo.storage_path, 600)).data?.signedUrl ?? null
    : null);
  const profession = category?.name ?? profile?.company_name ?? profile?.service_area_label ?? profile?.base_city ?? null;
  const active = profile?.approval_status === "approved" && profile?.public_status === "public";
  return <TradespersonShell profile={{ name, profession, active: active && !deletion, photoUrl }} deletionPending={Boolean(deletion)}>{children}</TradespersonShell>;
}
