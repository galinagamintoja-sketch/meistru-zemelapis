import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth-session";
import { createServerSupabase } from "../../../../../lib/supabase";

export async function PATCH(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin Google login required" }, { status: 401 });
  const body = await request.json();
  const id = String(body.id ?? "");
  const action = String(body.action ?? "");
  if (!id || !["edit", "approve", "reject"].includes(action)) return NextResponse.json({ error: "Invalid draft action" }, { status: 400 });
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ ok: true, mode: "seed" });
  const { data: draft, error: readError } = await supabase.from("marketing_drafts").select("*").eq("id", id).single();
  if (readError || !draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  if (action === "edit") {
    const nextBody = String(body.body ?? draft.body).trim();
    const recipient = String(body.recipientIdentity ?? draft.recipient_identity).trim();
    const channel = String(body.channel ?? draft.channel);
    if (!nextBody || !recipient || !["telegram", "email", "sms"].includes(channel)) return NextResponse.json({ error: "Message, recipient and channel are required" }, { status: 400 });
    const { data, error } = await supabase.from("marketing_drafts").update({
      body: nextBody, recipient_identity: recipient, channel, revision: draft.revision + 1,
      status: "draft", approved_revision: null, approved_by: null, approved_at: null, updated_at: new Date().toISOString()
    }).eq("id", id).eq("revision", draft.revision).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    await supabase.from("marketing_events").insert({ contact_id: draft.contact_id, event_type: "draft_revised", actor_type: "admin", actor_id: admin.email, payload: { draftId: id, revision: data.revision } });
    return NextResponse.json({ ok: true, draft: data });
  }

  if (action === "reject") {
    const { error } = await supabase.from("marketing_drafts").update({ status: "rejected", approved_revision: null, approved_by: null, approved_at: null, updated_at: new Date().toISOString() }).eq("id", id).eq("revision", draft.revision);
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  const { data: queueId, error: approveError } = await supabase.rpc("approve_marketing_draft", {
    target_draft_id: id, target_revision: draft.revision, reviewer: admin.email, target_due_at: body.dueAt ?? new Date().toISOString()
  });
  if (approveError) return NextResponse.json({ error: "Draft changed or is no longer approvable" }, { status: 409 });
  return NextResponse.json({ ok: true, queueId });
}
