import LocalProApp from "../components/LocalProApp";
import { getCategories, getSpecialists } from "../lib/specialists";
import { createSupabaseAuthClient } from "../lib/supabase-ssr";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [specialists, categories, auth] = await Promise.all([
    getSpecialists(),
    getCategories(),
    createSupabaseAuthClient().then((client) => client.auth.getUser()).catch(() => ({ data: { user: null } }))
  ]);

  return <LocalProApp initialSpecialists={specialists} categories={categories} registrationAuthenticated={Boolean(auth.data.user)} />;
}
