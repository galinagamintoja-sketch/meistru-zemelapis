import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "../../../../../../lib/auth-session";
import { createServerSupabase } from "../../../../../../lib/supabase";

const linkConversationSchema = z.object({
  conversationId: z.string().uuid(),
  contactId: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) {
    return NextResponse.json(
      { error: "Admin Google login required" },
      { status: 401 },
    );
  }

  const parsed = linkConversationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid conversation link request", code: "INVALID_CONVERSATION_LINK" },
      { status: 400 },
    );
  }

  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Marketing database is unavailable", code: "MARKETING_DATABASE_UNAVAILABLE" },
      { status: 503 },
    );
  }
  const { data, error } = await supabase.rpc(
    "link_marketing_conversation_to_contact",
    {
      target_conversation_id: parsed.data.conversationId,
      target_contact_id: parsed.data.contactId,
      reviewer: admin.email,
    },
  );
  if (error) {
    console.error("Marketing conversation linking failed", {
      code: error.code,
      conversationId: parsed.data.conversationId,
    });
    return NextResponse.json(
      {
        error: "Conversation could not be linked; reload and review its current state",
        code: "CONVERSATION_LINK_CONFLICT",
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, result: data });
}
