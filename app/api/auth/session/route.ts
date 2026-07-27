import { NextResponse } from "next/server";
import { isAdminEmail } from "../../../../lib/auth-session";
import { createSupabaseAuthClient } from "../../../../lib/supabase-ssr";

export async function GET() {
  const supabase = await createSupabaseAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.json({
    user: user ? {
      email: user.email,
      name: user.user_metadata?.full_name ?? user.email,
      picture: user.user_metadata?.avatar_url
    } : null,
    isAdmin: isAdminEmail(user?.email)
  });
}
