import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "../../../../lib/supabase-ssr";

export async function POST() {
  const supabase = await createSupabaseAuthClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
