import type { Metadata } from "next";
import JobsPageClient from "../../components/JobsPageClient";

export const metadata: Metadata = {
  title: "Darbų skelbimai | LocalPro",
  description: "Naujausi vieši darbų užsakymai pagal amatą ir vietovę.",
  alternates: { canonical: "/darbu-skelbimai" }
};

export default function JobsPage() {
  return <JobsPageClient />;
}
