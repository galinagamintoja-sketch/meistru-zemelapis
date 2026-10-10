import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "../../../lib/supabase-ssr";
import { getLinkedTradespersonProfile } from "../../../lib/tradesperson-account";
import { isAdminEmail } from "../../../lib/auth-session";
import { adminDestination } from "../../../lib/admin-destination";
import { safeAuthNext } from "../../../lib/safe-auth-next";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=oauth_callback", url.origin));

  const supabase = await createSupabaseAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth_callback", url.origin));

  const requested = url.searchParams.get("next") ?? "/meistras";
  const next = safeAuthNext(requested);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.redirect(new URL("/login?error=oauth_callback", url.origin));
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
