import type { Metadata } from "next";
import JobsPageClient from "../../components/JobsPageClient";
import { getFirstPublicJobPage, getPublicJobTaxonomy, publicJobFilters } from "../../lib/public-jobs-first-page";
import { createSupabaseAuthClient } from "../../lib/supabase-ssr";
import { getLinkedTradespersonProfile } from "../../lib/tradesperson-account";

export const metadata: Metadata = {
  title: "Darbų skelbimai | LocalPro",
  description: "Naujausi vieši darbų užsakymai pagal amatą ir vietovę.",
  alternates: { canonical: "/darbu-skelbimai" }
};

export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = publicJobFilters(await searchParams);
  const [firstPage, taxonomy, userId] = await Promise.all([
    filters ? getFirstPublicJobPage(filters) : Promise.resolve(null),
    getPublicJobTaxonomy(),
    createSupabaseAuthClient().then((auth) => auth.auth.getUser()).then(({ data }) => data.user?.id ?? "").catch(() => null)
  ]);
  const access = userId === null ? null : !userId ? "guest" : await getLinkedTradespersonProfile(userId) ? "ready" : "registration";
  return <JobsPageClient initialFilters={filters ?? undefined} initialFeed={firstPage ?? undefined} initialTaxonomy={taxonomy ?? undefined} initialAccess={access} />;
}
