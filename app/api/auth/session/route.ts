import { NextResponse } from "next/server";
import { getSessionFromRequest, isAdminEmail } from "../../../../lib/auth-session";

export async function GET(request: Request) {
  const user = getSessionFromRequest(request);

  return NextResponse.json({
    user,
    isAdmin: isAdminEmail(user?.email)
  });
}
