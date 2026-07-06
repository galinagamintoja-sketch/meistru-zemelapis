import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../lib/supabase";
import { enquirySchema } from "../../../lib/validators";

export async function POST(request: Request) {
  const parsed = enquirySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Netinkama užklausos forma", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServerSupabase();

  if (!supabase) {
    return NextResponse.json({ ok: true, mode: "seed" });
  }

  const payload = parsed.data;
  const { error } = await supabase.from("enquiries").insert({
    tradesperson_profile_id: payload.specialistId,
    event_type: payload.eventType,
    client_name: payload.clientName ?? null,
    client_phone: payload.clientPhone ?? null,
    client_email: payload.clientEmail ?? null,
    source_city: payload.city ?? null,
    source_service: payload.service ?? null,
    message: payload.message ?? null
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
