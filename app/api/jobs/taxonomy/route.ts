import { NextResponse } from "next/server";
import { getPublicJobTaxonomy, publicJobFilters } from "../../../../lib/public-jobs-first-page";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const filters = publicJobFilters(Object.fromEntries(new URL(request.url).searchParams));
  if (!filters) return NextResponse.json({ error: "invalid_filter" }, { status: 400 });
  const taxonomy = await getPublicJobTaxonomy(filters);
  if (!taxonomy) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ schema_version: 2, ...taxonomy },
    { headers: { "Cache-Control": "private, no-store" } });
}
