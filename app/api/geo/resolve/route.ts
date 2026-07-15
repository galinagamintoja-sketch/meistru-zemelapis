import { NextResponse } from "next/server";
import { resolveCityCoordinates } from "../../../../lib/geo";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const location = searchParams.get("location")?.trim();

  if (!location) {
    return NextResponse.json({ error: "Nurodykite vieta." }, { status: 400 });
  }

  const coordinates = await resolveCityCoordinates(location);

  if (!coordinates) {
    return NextResponse.json({ error: "Nepavyko rasti vietos Lietuvoje." }, { status: 404 });
  }

  return NextResponse.json({ coordinates });
}
