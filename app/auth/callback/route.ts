import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "../../../lib/supabase-ssr";
import { getLinkedTradespersonProfile } from "../../../lib/tradesperson-account";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=oauth_callback", url.origin));

  const supabase = await createSupabaseAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth_callback", url.origin));

  const requested = url.searchParams.get("next") ?? "/meistras";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/meistras";
  const { data: { user } } = await supabase.auth.getUser();
  if (next.startsWith("/meistras") && user && !(await getLinkedTradespersonProfile(user.id))) {
    return NextResponse.redirect(new URL("/?register=1#register", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
