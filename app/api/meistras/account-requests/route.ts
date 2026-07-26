import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "../../../../lib/supabase";
import { requireOwnedProfile } from "../../../../lib/tradesperson-account";

const schema = z.object({ type: z.enum(["data_export", "account_deletion"]) });

export async function POST(request: Request) {
  const { user, profile } = await requireOwnedProfile();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Neteisingas prašymas." }, { status: 400 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Neleistina užklausa." }, { status: 403 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Paslauga nepasiekiama." }, { status: 503 });
  const { error } = await supabase.from("account_privacy_requests").insert({ auth_user_id: user.id, tradesperson_profile_id: profile?.id ?? null, request_type: parsed.data.type });
  if (error?.code === "23505") return NextResponse.json({ message: "Toks prašymas jau laukia vykdymo." });
  if (error) return NextResponse.json({ error: "Prašymo pateikti nepavyko." }, { status: 500 });
  if (profile) await supabase.from("admin_actions").insert({ tradesperson_profile_id: profile.id, action: `tradesperson_${parsed.data.type}_requested`, notes: "Requested by account owner", created_by_role: "tradesperson" });
  return NextResponse.json({ message: "Prašymas užregistruotas. Susisieksime patvirtintu prisijungimo el. paštu." });
}
