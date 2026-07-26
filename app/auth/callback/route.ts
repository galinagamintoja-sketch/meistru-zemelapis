import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "../../../lib/supabase-ssr";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=oauth_callback", url.origin));

  const supabase = await createSupabaseAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth_callback", url.origin));

  const requested = url.searchParams.get("next") ?? "/meistras";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/meistras";
  return NextResponse.redirect(new URL(next, url.origin));
}
