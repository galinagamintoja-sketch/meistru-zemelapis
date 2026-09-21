import { NextResponse } from "next/server";
import { createMarketingAuthClient } from "../../../../../../lib/marketing/supabase";

export async function POST() {
  const supabase = await createMarketingAuthClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
