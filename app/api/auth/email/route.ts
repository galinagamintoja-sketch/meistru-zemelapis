import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthClient } from "../../../../lib/supabase-ssr";

const input = z.object({ action: z.enum(["sign-in", "sign-up", "recovery", "update-password"]), email: z.string().trim().email().optional(), password: z.string().min(10).max(128).optional(), next: z.string().max(300).optional() });

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== origin) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Patikrinkite el. paštą ir slaptažodį." }, { status: 400 });
  const supabase = await createSupabaseAuthClient();
  const { action, email, password } = parsed.data;
  const next = parsed.data.next?.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/meistras";
  if (action === "sign-in") {
    if (!email || !password) return NextResponse.json({ error: "Įveskite el. paštą ir slaptažodį." }, { status: 400 });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? NextResponse.json({ error: "El. paštas arba slaptažodis neteisingas." }, { status: 401 }) : NextResponse.json({ redirectTo: next });
  }
  if (action === "sign-up") {
    if (!email || !password) return NextResponse.json({ error: "Įveskite el. paštą ir slaptažodį." }, { status: 400 });
    const callback = new URL("/auth/callback", origin); callback.searchParams.set("next", next);
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback.toString() } });
    return error ? NextResponse.json({ error: "Paskyros sukurti nepavyko." }, { status: 400 }) : NextResponse.json({ message: "Patvirtinimo nuoroda išsiųsta el. paštu." });
  }
  if (action === "recovery") {
    if (!email) return NextResponse.json({ error: "Įveskite el. paštą." }, { status: 400 });
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=%2Fauth%2Fatnaujinti-slaptazodi` });
    return NextResponse.json({ message: "Jei paskyra egzistuoja, slaptažodžio atkūrimo nuoroda išsiųsta." });
  }
  if (!password) return NextResponse.json({ error: "Slaptažodis per trumpas." }, { status: 400 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Atkūrimo sesija negalioja." }, { status: 401 });
  const { error } = await supabase.auth.updateUser({ password });
  return error ? NextResponse.json({ error: "Slaptažodžio pakeisti nepavyko." }, { status: 400 }) : NextResponse.json({ redirectTo: "/meistras/paskyra" });
}
