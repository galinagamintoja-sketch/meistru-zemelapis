import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthClient } from "../../../../lib/supabase-ssr";

const next = z.string().max(300).optional();
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sign-in"), email: z.string().trim().email(), password: z.string().min(10).max(128), next }),
  z.object({ action: z.literal("sign-up"), email: z.string().trim().email(), password: z.string().min(10).max(128), next }),
  z.object({ action: z.literal("recovery"), email: z.string().trim().email(), next }),
  z.object({ action: z.literal("update-password"), password: z.string().min(10).max(128), next })
]);

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== origin) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Patikrinkite el. paštą ir slaptažodį." }, { status: 400 });
  const supabase = await createSupabaseAuthClient();
  const { action } = parsed.data;
  const next = parsed.data.next?.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/meistras";
  if (action === "sign-in") {
    const { email, password } = parsed.data;
    if (!email || !password) return NextResponse.json({ error: "Įveskite el. paštą ir slaptažodį." }, { status: 400 });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? NextResponse.json({ error: "El. paštas arba slaptažodis neteisingas." }, { status: 401 }) : NextResponse.json({ redirectTo: next });
  }
  if (action === "sign-up") {
    const { email, password } = parsed.data;
    if (!email || !password) return NextResponse.json({ error: "Įveskite el. paštą ir slaptažodį." }, { status: 400 });
    const callback = new URL("/auth/callback", origin); callback.searchParams.set("next", next);
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback.toString() } });
    return error ? NextResponse.json({ error: "Paskyros sukurti nepavyko." }, { status: 400 }) : NextResponse.json({ message: "Patvirtinimo nuoroda išsiųsta el. paštu." });
  }
  if (action === "recovery") {
    const { email } = parsed.data;
    if (!email) return NextResponse.json({ error: "Įveskite el. paštą." }, { status: 400 });
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=%2Fauth%2Fatnaujinti-slaptazodi` });
    return NextResponse.json({ message: "Jei paskyra egzistuoja, slaptažodžio atkūrimo nuoroda išsiųsta." });
  }
  const { password } = parsed.data;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Atkūrimo sesija negalioja." }, { status: 401 });
  const { error } = await supabase.auth.updateUser({ password });
  return error ? NextResponse.json({ error: "Slaptažodžio pakeisti nepavyko." }, { status: 400 }) : NextResponse.json({ redirectTo: "/meistras/paskyra" });
}
