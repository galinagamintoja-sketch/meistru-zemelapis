import { NextResponse } from "next/server";

export async function POST(request: Request) {
  return NextResponse.json(
    { error: "Naudokite Supabase Auth OAuth prisijungimą.", loginUrl: new URL("/auth/google", request.url).toString() },
    { status: 410 }
  );
}
