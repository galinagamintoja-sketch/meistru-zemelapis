import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMarketingAdminSession } from "../../../../../../lib/marketing/auth";
import { createMarketingServerSupabase } from "../../../../../../lib/marketing/supabase";

const linkConversationSchema = z.object({
  conversationId: z.string().uuid(),
  contactId: z.string().uuid(),
}).strict();

export async function POST(request: Request) {
  const admin = await requireMarketingAdminSession();
  if (!admin) {
    return NextResponse.json(
      { error: "CRM admin login required" },
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

  const supabase = createMarketingServerSupabase();
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
