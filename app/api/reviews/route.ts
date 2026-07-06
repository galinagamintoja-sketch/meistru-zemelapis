import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../lib/supabase";
import { reviewSchema } from "../../../lib/validators";

export async function POST(request: Request) {
  const parsed = reviewSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Netinkamas atsiliepimas", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServerSupabase();

  if (!supabase) {
    return NextResponse.json({ ok: true, mode: "seed", moderationStatus: "pending" });
  }

  const payload = parsed.data;
  const { error } = await supabase.from("reviews").insert({
    tradesperson_profile_id: payload.specialistId,
    client_name: payload.clientName,
    rating: payload.rating,
    text: payload.text,
    photos: payload.photos,
    moderation_status: "pending"
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, moderationStatus: "pending" });
}
