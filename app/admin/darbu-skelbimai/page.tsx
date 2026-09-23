import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseAuthClient } from "../../../lib/supabase-ssr";
import { isAdminEmail } from "../../../lib/auth-session";
import AdminJobsClient from "../../../components/AdminJobsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Darbų skelbimų administravimas | LocalPro", robots: { index: false, follow: false } };

export default async function AdminJobsPage() {
  const auth = await createSupabaseAuthClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.email) redirect("/login?next=%2Fadmin%2Fdarbu-skelbimai");
  if (!isAdminEmail(user.email)) redirect("/");
  return <main style={{ maxWidth: 1000, margin: "40px auto", padding: 20 }}>
    <Link href="/admin">← Administravimas</Link><h1>Darbų skelbimai</h1><AdminJobsClient />
  </main>;
}
