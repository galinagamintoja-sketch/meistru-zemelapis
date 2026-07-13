import { NextResponse } from "next/server";
import { getSpecialists } from "../../../lib/specialists";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const specialists = await getSpecialists({
    service: searchParams.get("service"),
    city: searchParams.get("city"),
    location: searchParams.get("location"),
    lat: parseOptionalNumber(searchParams.get("lat")),
    lng: parseOptionalNumber(searchParams.get("lng")),
    customerRadiusKm: parseOptionalNumber(searchParams.get("customerRadiusKm") ?? searchParams.get("radius")),
    verification: searchParams.get("verification"),
    verifiedOnly: searchParams.get("verified") === "true",
    availableSoon: searchParams.get("availableSoon") === "true",
    minRating: parseOptionalNumber(searchParams.get("minRating"))
  });

  return NextResponse.json({ specialists });
}

function parseOptionalNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
