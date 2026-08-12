import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getSpecialist } from "../../../lib/specialists";
import { isSeoEligible, profilePath } from "../../../lib/seo";

type PageProps = { params: Promise<{ slugOrId: string }> };

export const metadata: Metadata = {
  title: "Meistro profilis | LocalPro",
  robots: { index: false, follow: true }
};

export default async function LegacySpecialistPage({ params }: PageProps) {
  const specialist = await getSpecialist((await params).slugOrId);
  if (!specialist || !isSeoEligible(specialist)) notFound();
  permanentRedirect(profilePath(specialist));
}
