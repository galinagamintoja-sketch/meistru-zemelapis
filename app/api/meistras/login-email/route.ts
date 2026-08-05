import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthClient } from "../../../../lib/supabase-ssr";
import { accountMutationBlocked, isSameOrigin } from "../../../../lib/account-deletion";

const schema = z.object({ email: z.string().trim().email().max(254) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const supabase = await createSupabaseAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neprisijungta." }, { status: 401 });
  if (await accountMutationBlocked(user.id)) return NextResponse.json({ error: "Paskyros ištrynimas suplanuotas. Prisijungimo duomenų keisti negalima." }, { status: 409 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neteisingas el. pašto adresas." }, { status: 400 });
  if (parsed.data.email.toLowerCase() === user.email?.toLowerCase()) return NextResponse.json({ ok: true });
  const { error } = await supabase.auth.updateUser({ email: parsed.data.email });
  if (error) return NextResponse.json({ error: "El. pašto pakeitimo pradėti nepavyko." }, { status: 400 });
  return NextResponse.json({ ok: true, message: "Patvirtinimo laiškai išsiųsti pagal Supabase saugumo nustatymus." });
}
