import { NextResponse } from "next/server";
import { z } from "zod";
import { isMarketingAdminEmail } from "../../../../../../lib/marketing/auth";
import { createMarketingAuthClient } from "../../../../../../lib/marketing/supabase";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(256),
}).strict();

export async function POST(request: Request) {
  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });

  const supabase = await createMarketingAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user?.email || !isMarketingAdminEmail(data.user.email)) {
    if (data.session) await supabase.auth.signOut();
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
