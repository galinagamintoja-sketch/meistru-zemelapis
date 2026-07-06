import { NextResponse } from "next/server";
import { getSpecialists } from "../../../lib/specialists";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const specialists = await getSpecialists({
    service: searchParams.get("service"),
    city: searchParams.get("city"),
    verification: searchParams.get("verification")
  });

  return NextResponse.json({ specialists });
}
