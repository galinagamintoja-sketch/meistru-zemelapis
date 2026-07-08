import { NextResponse } from "next/server";
import { loginSessionCookie, verifySession } from "../../../../lib/auth-session";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const sessionCookie = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${loginSessionCookie}=`))
    ?.slice(loginSessionCookie.length + 1);

  return NextResponse.json({ user: verifySession(sessionCookie) });
}
