import { redirect } from "next/navigation";
import LocalProApp from "../../components/LocalProApp";
import { getCategories } from "../../lib/specialists";
import { createSupabaseAuthClient } from "../../lib/supabase-ssr";
import { getLinkedTradespersonProfile } from "../../lib/tradesperson-account";
import { getHomepageAccountState } from "../../lib/homepage-account-state";
import { isAdminEmail } from "../../lib/auth-session";
import { inspectVerifiedEmailResolution } from "../../lib/verified-email-resolution";

export const dynamic = "force-dynamic";

export default async function TradespersonRegistrationPage() {
  const [categories, auth] = await Promise.all([
    getCategories(),
    createSupabaseAuthClient().then((client) => client.auth.getUser()).catch(() => ({ data: { user: null } }))
  ]);
  const user = auth.data.user;
  const profile = user ? await getLinkedTradespersonProfile(user.id) : null;
  if (profile) redirect("/meistras/uzklausos");
  if (user) {
    const resolution = await inspectVerifiedEmailResolution();
    if (resolution.outcome === "unique_match" || resolution.outcome === "ambiguous" || resolution.outcome === "ownership_conflict") {
      redirect("/meistras/susieti");
    }
  }

  const accountState = {
    ...getHomepageAccountState(user?.id ?? null, false, isAdminEmail(user?.email)),
    displayName: user?.user_metadata?.full_name ?? user?.user_metadata?.name,
    email: user?.email,
    avatarUrl: user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture
  };

  return (
    <LocalProApp
      initialSpecialists={[]}
      categories={categories}
      accountState={accountState}
      registrationOnly
    />
  );
}
