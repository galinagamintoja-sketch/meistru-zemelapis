import type { Metadata } from "next";
import JobsPageClient from "../../components/JobsPageClient";
import { getFirstPublicJobPage, getPublicJobTaxonomy, publicJobFilters } from "../../lib/public-jobs-first-page";

export const metadata: Metadata = {
  title: "Darbų skelbimai | LocalPro",
  description: "Naujausi vieši darbų užsakymai pagal amatą ir vietovę.",
  alternates: { canonical: "/darbu-skelbimai" }
};

export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = publicJobFilters(await searchParams);
  const [firstPage, taxonomy] = await Promise.all([
    filters ? getFirstPublicJobPage(filters) : Promise.resolve(null),
    getPublicJobTaxonomy()
  ]);
  return <JobsPageClient initialFilters={filters ?? undefined} initialFeed={firstPage ?? undefined} initialTaxonomy={taxonomy ?? undefined} />;
}
