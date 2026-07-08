import { NextResponse } from "next/server";
import { getGoogleClientId, loginSessionCookie, signSession } from "../../../../lib/auth-session";
import { createServerSupabase } from "../../../../lib/supabase";

type GoogleTokenInfo = {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string;
  name?: string;
  picture?: string;
  exp?: string;
  error_description?: string;
};

export async function POST(request: Request) {
  const { credential } = await request.json().catch(() => ({ credential: "" }));

  if (!credential || typeof credential !== "string") {
    return NextResponse.json({ error: "Google credential required" }, { status: 400 });
  }

  const tokenInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
    cache: "no-store"
  });
  const tokenInfo = (await tokenInfoResponse.json().catch(() => ({}))) as GoogleTokenInfo;
  const clientId = getGoogleClientId();

  if (!tokenInfoResponse.ok || tokenInfo.aud !== clientId || !tokenInfo.sub || !tokenInfo.email) {
    return NextResponse.json({ error: tokenInfo.error_description ?? "Google login could not be verified" }, { status: 401 });
  }

  if (tokenInfo.email_verified !== "true") {
    return NextResponse.json({ error: "Google email must be verified" }, { status: 401 });
  }

  const expiresAt = Math.min(Number(tokenInfo.exp ?? 0) * 1000, Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = {
    email: tokenInfo.email,
    name: tokenInfo.name ?? tokenInfo.email,
    picture: tokenInfo.picture,
    googleSub: tokenInfo.sub,
    expiresAt
  };

  const supabase = createServerSupabase();
  if (supabase) {
    await supabase.from("users").upsert(
      {
        email: session.email,
        email_verified: true,
        role: "tradesperson"
      },
      { onConflict: "email" }
    );
  }

  const response = NextResponse.json({ user: session });
  response.cookies.set(loginSessionCookie, signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
  });
  return response;
}
