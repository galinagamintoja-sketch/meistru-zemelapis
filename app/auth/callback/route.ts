import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "../../../lib/supabase-ssr";
import { getLinkedTradespersonProfile } from "../../../lib/tradesperson-account";
import { isAdminEmail } from "../../../lib/auth-session";
import { adminDestination } from "../../../lib/admin-destination";
import { safeAuthNext } from "../../../lib/safe-auth-next";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeAuthNext(url.searchParams.get("next"));
  const failure = () => {
    const failed = new URL("/login", url.origin);
    failed.searchParams.set("error", "oauth_callback");
    failed.searchParams.set("next", next);
    return NextResponse.redirect(failed);
  };
  const code = url.searchParams.get("code");
  if (!code) return failure();

  const supabase = await createSupabaseAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return failure();


  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return failure();
  const adminNext = adminDestination(user, next);
  if (adminNext) return NextResponse.redirect(new URL(adminNext, url.origin));
  if ((next === "/admin" || next.startsWith("/admin/")) && !isAdminEmail(user?.email)) {
    return NextResponse.redirect(new URL("/admin?error=unauthorised", url.origin));
  }
  if ((next.startsWith("/meistras") || next.startsWith("/darbu-skelbimai")) && user && !(await getLinkedTradespersonProfile(user.id))) {
    const registration = new URL("/meistro-registracija", url.origin);
    if (next.startsWith("/darbu-skelbimai")) registration.searchParams.set("next", next);
    return NextResponse.redirect(registration);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
