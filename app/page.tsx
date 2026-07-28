import LocalProApp from "../components/LocalProApp";
import { getCategories, getSpecialists } from "../lib/specialists";
import { createSupabaseAuthClient } from "../lib/supabase-ssr";
import { getLinkedTradespersonProfile } from "../lib/tradesperson-account";
import { getHomepageAccountState, homepageAccountDestination } from "../lib/homepage-account-state";
import { isAdminEmail } from "../lib/auth-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ register?: string }> }) {
  const [specialists, categories, auth] = await Promise.all([
    getSpecialists(),
    getCategories(),
    createSupabaseAuthClient().then((client) => client.auth.getUser()).catch(() => ({ data: { user: null } }))
  ]);

  const user = auth.data.user;
  const profile = user ? await getLinkedTradespersonProfile(user.id) : null;
  const accountState = getHomepageAccountState(user?.id ?? null, Boolean(profile), isAdminEmail(user?.email));
  const destination = homepageAccountDestination(accountState, (await searchParams).register === "1");
  if (destination) redirect(destination);
  return <LocalProApp initialSpecialists={specialists} categories={categories} accountState={accountState} />;
}
