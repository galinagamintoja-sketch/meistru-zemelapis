import { NextResponse } from "next/server";
import { loginSessionCookie } from "../../../../lib/auth-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(loginSessionCookie, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return response;
}
