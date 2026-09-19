import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth-session";
import { createServerSupabase } from "../../../../../lib/supabase";

export async function GET(request: Request) {
  if (!(await requireAdminSession(request)))
    return NextResponse.json(
      { error: "Admin Google login required" },
      { status: 401 },
    );
  const supabase = createServerSupabase();
  if (!supabase)
    return NextResponse.json({
      mode: "seed",
      counts: {},
      queue: [],
      conversations: [],
      drafts: [],
      settings: {},
    });
  const [contacts, queue, conversations, drafts, settings] = await Promise.all([
    supabase.from("marketing_contacts").select("status"),
    supabase
      .from("marketing_send_queue")
      .select(
        "id,status,due_at,attempt_count,last_attempt_at,last_error,cancellation_reason,approved_snapshot_id,marketing_approved_message_snapshots(body,channel,recipient_identity,approved_revision,approved_at,approved_by),marketing_drafts(id,draft_type,contact_id,marketing_contacts(display_name))",
      )
      .order("due_at")
      .limit(100),
    supabase
      .from("marketing_conversations")
      .select(
        "id,contact_id,needs_reply,unread_count,status,last_inbound_at,last_outbound_at,marketing_contacts(display_name,status),marketing_messages(id,channel,direction,body,status,created_at)",
      )
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("marketing_drafts")
      .select(
        "id,contact_id,channel,recipient_identity,body,draft_type,status,revision,approved_revision,created_at,marketing_contacts(display_name)",
      )
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase.from("marketing_settings").select("key,value,updated_at"),
  ]);
  const error = [contacts, queue, conversations, drafts, settings].find(
    (result) => result.error,
  )?.error;
  if (error) {
    console.error("Marketing overview query failed", error);
    return NextResponse.json(
      {
        error: "Marketing overview could not be loaded",
        code: "MARKETING_OVERVIEW_FAILED",
      },
      { status: 500 },
    );
  }
  const counts = (contacts.data ?? []).reduce<Record<string, number>>(
    (all, row) => {
      all[row.status] = (all[row.status] ?? 0) + 1;
      return all;
    },
    {},
  );
  return NextResponse.json({
    mode: "database",
    counts,
    queue: queue.data ?? [],
    conversations: conversations.data ?? [],
    drafts: drafts.data ?? [],
    settings: Object.fromEntries(
      (settings.data ?? []).map((row) => [row.key, row.value]),
    ),
  });
}
