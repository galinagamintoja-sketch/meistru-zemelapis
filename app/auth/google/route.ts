import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "../../../lib/supabase-ssr";
import { safeAuthNext } from "../../../lib/safe-auth-next";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requested = requestUrl.searchParams.get("next") ?? "/meistras";
  const next = safeAuthNext(requested);
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
    const failed = new URL("/login", requestUrl.origin);
    failed.searchParams.set("error", "oauth_start");
    failed.searchParams.set("next", next);
    return NextResponse.redirect(failed);
  }
  return NextResponse.redirect(data.url);
}
