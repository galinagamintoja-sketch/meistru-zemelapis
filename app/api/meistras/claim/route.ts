import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Profile claiming is no longer supported. Complete a new authenticated registration." },
    { status: 410 }
  );
}
