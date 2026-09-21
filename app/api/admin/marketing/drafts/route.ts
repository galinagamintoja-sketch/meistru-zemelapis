import { NextResponse } from "next/server";
import { requireMarketingAdminSession } from "../../../../../lib/marketing/auth";
import { createMarketingServerSupabase } from "../../../../../lib/marketing/supabase";
import { z } from "zod";

const draftActionSchema = z.discriminatedUnion("action", [
  z.object({
    id: z.string().uuid(),
    action: z.literal("edit"),
    body: z.string().trim().min(1).max(10000),
    recipientIdentity: z.string().trim().min(1).max(320).optional(),
    channel: z.enum(["telegram", "email", "sms"]).optional(),
    channelAccountId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    id: z.string().uuid(),
    action: z.literal("approve"),
    dueAt: z.string().datetime().optional(),
  }),
  z.object({ id: z.string().uuid(), action: z.literal("reject") }),
  z.object({
    ids: z.array(z.string().uuid()).min(1).max(500),
    action: z.literal("approve_batch"),
    dueAt: z.string().datetime().optional(),
  }),
]);

export async function PATCH(request: Request) {
  const admin = await requireMarketingAdminSession();
  if (!admin)
    return NextResponse.json(
      { error: "CRM admin login required" },
      { status: 401 },
    );
  const parsed = draftActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid draft action", code: "INVALID_DRAFT_ACTION" },
      { status: 400 },
    );
  const body = parsed.data;
  const supabase = createMarketingServerSupabase();
  if (body.action === "approve_batch") {
    const { data: batchId, error } = await supabase.rpc(
      "approve_marketing_draft_batch",
      {
        target_draft_ids: body.ids,
        reviewer: admin.email,
        target_due_at: body.dueAt ?? new Date().toISOString(),
      },
    );
    if (error) {
      console.error("Marketing draft batch approval failed", error);
      return NextResponse.json(
        {
          error: "One or more drafts changed and the batch was not approved",
          code: "BATCH_APPROVAL_CONFLICT",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, batchId });
  }
  const id = body.id;
  const action = body.action;
  const { data: draft, error: readError } = await supabase
    .from("marketing_drafts")
    .select("*")
    .eq("id", id)
    .single();
  if (readError || !draft)
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  if (action === "edit") {
    const { data, error } = await supabase.rpc("revise_marketing_draft", {
      target_draft_id: id,
      expected_revision: draft.revision,
      next_body: body.body,
      next_recipient_identity:
        body.recipientIdentity ?? draft.recipient_identity,
      next_channel: body.channel ?? draft.channel,
      next_channel_account_id:
        body.channelAccountId === undefined
          ? draft.channel_account_id
          : body.channelAccountId,
      editor: admin.email,
    });
    if (error) {
      console.error("Marketing draft revision failed", error);
      return NextResponse.json(
        {
          error: "Draft changed; reload and try again",
          code: "DRAFT_REVISION_CONFLICT",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, draft: data });
  }

  if (action === "reject") {
    const { error } = await supabase.rpc("reject_marketing_draft", {
      target_draft_id: id,
      expected_revision: draft.revision,
      reviewer: admin.email,
    });
    if (error) {
      console.error("Marketing draft rejection failed", error);
      return NextResponse.json(
        {
          error: "Draft changed; reload and try again",
          code: "DRAFT_REJECTION_CONFLICT",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  const { data: queueId, error: approveError } = await supabase.rpc(
    "approve_marketing_draft",
    {
      target_draft_id: id,
      target_revision: draft.revision,
      reviewer: admin.email,
      target_due_at: body.dueAt ?? new Date().toISOString(),
    },
  );
  if (approveError)
    return NextResponse.json(
      { error: "Draft changed or is no longer approvable" },
      { status: 409 },
    );
  return NextResponse.json({ ok: true, queueId });
}
