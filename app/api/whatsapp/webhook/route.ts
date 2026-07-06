import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const supabase = createServerSupabase();

  if (!supabase) {
    return NextResponse.json({ ok: true, mode: "seed" });
  }

  const entries = payload.entry ?? [];
  const messages = entries.flatMap((entry: any) =>
    (entry.changes ?? []).flatMap((change: any) => change.value?.messages ?? [])
  );

  for (const message of messages) {
    const phone = message.from;
    const text = message.text?.body ?? "";
    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .upsert({ phone, status: "open" }, { onConflict: "phone" })
      .select("id")
      .single();

    if (conversation?.id) {
      await supabase.from("whatsapp_messages").insert({
        whatsapp_conversation_id: conversation.id,
        direction: "inbound",
        provider_message_id: message.id,
        message_type: message.type ?? "text",
        body: text
      });
    }
  }

  return NextResponse.json({ ok: true, received: messages.length });
}
