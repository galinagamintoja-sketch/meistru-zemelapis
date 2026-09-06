import HomepagePreviewV2 from "../components/HomepagePreviewV2";
import { getCategories, getSpecialists } from "../lib/specialists";
import { createSupabaseAuthClient } from "../lib/supabase-ssr";
import { getLinkedTradespersonProfile } from "../lib/tradesperson-account";
import { getHomepageAccountState } from "../lib/homepage-account-state";
import { isAdminEmail } from "../lib/auth-session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [specialists, categories, auth] = await Promise.all([
    getSpecialists(),
    getCategories(),
    createSupabaseAuthClient().then((client) => client.auth.getUser()).catch(() => ({ data: { user: null } }))
  ]);

  const user = auth.data.user;
  const profile = user ? await getLinkedTradespersonProfile(user.id) : null;
  const accountState = {
    ...getHomepageAccountState(user?.id ?? null, Boolean(profile), isAdminEmail(user?.email)),
    displayName: profile?.display_name ?? profile?.company_name ?? user?.user_metadata?.full_name ?? user?.user_metadata?.name,
    email: user?.email,
    avatarUrl: user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture
  };
  return <HomepagePreviewV2 initialSpecialists={specialists} categories={categories} accountState={accountState} />;
}
