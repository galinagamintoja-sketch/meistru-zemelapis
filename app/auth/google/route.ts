import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "../../../lib/supabase-ssr";

function safeOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL(configured).origin;
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const supabase = await createSupabaseAuthClient();
  const callback = new URL("/auth/callback", safeOrigin(request));
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
