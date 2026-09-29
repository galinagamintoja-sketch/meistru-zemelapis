import { NextResponse } from "next/server";
import { getPublicJobTaxonomy } from "../../../../lib/public-jobs-first-page";

export async function GET() {
  const taxonomy = await getPublicJobTaxonomy();
  if (!taxonomy) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ schema_version: 2, ...taxonomy },
    { headers: { "Cache-Control": "public, max-age=60" } });
}
