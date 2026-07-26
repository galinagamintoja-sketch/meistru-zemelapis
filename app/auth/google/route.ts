import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "../../../lib/supabase-ssr";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requested = requestUrl.searchParams.get("next") ?? "/meistras";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/meistras";
  const supabase = await createSupabaseAuthClient();
  const callback = new URL("/auth/callback", requestUrl.origin);
  callback.searchParams.set("next", next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      queryParams: { access_type: "offline", prompt: "select_account" }
    }
  });

  if (error || !data.url) {
    return NextResponse.redirect(new URL("/login?error=oauth_start", request.url));
  }
  return NextResponse.redirect(data.url);
}
