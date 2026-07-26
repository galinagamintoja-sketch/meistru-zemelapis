import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "../../../../lib/supabase-ssr";

export async function POST(request: Request) {
  const auth = await createSupabaseAuthClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  const form = await request.formData();
  const token = String(form.get("token") ?? "").trim();
  if (token.length < 32 || token.length > 512) {
    return NextResponse.redirect(new URL("/meistras/susieti?error=invalid", request.url), { status: 303 });
  }

  const tokenHash = crypto.createHash("sha256").update(token, "utf8").digest("hex");
  const { error } = await auth.rpc("claim_tradesperson_profile", { p_token_hash: tokenHash });
  if (error) return NextResponse.redirect(new URL("/meistras/susieti?error=invalid", request.url), { status: 303 });
  return NextResponse.redirect(new URL("/meistras", request.url), { status: 303 });
}
