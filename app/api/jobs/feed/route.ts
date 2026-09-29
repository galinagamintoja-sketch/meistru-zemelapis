import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../lib/supabase";
import { createSupabaseAuthClient } from "../../../../lib/supabase-ssr";
import { JOB_PAGE_SIZE } from "../../../../lib/public-jobs-import";
import { readFeedCursor, signFeedCursor } from "../../../../lib/public-jobs-cursor";

export const dynamic = "force-dynamic";
type JobRow = { id: string; posted_at: string; [key: string]: unknown };
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  const secret = process.env.LOCALPRO_JOBS_CURSOR_SECRET;
  if (!secret || secret.length < 32) return json({ error: "unavailable" }, 503);
  const db = createServerSupabase();
  if (!db) return json({ error: "unavailable" }, 503);
  const url = new URL(request.url);
  const trade = url.searchParams.get("trade") || null;
  const area = url.searchParams.get("area") || null;
  const period = url.searchParams.get("period") || "all";
  const contactOnly = url.searchParams.get("contact_number") === "true";
  if (trade && !/^[0-9a-f-]{36}$/i.test(trade) || area && !/^[a-z0-9-]{2,80}$/.test(area) ||
    !["all", "1d", "3d", "7d"].includes(period) ||
    (url.searchParams.has("contact_number") && !["true", "false"].includes(url.searchParams.get("contact_number") ?? "")))
    return json({ error: "invalid_filter" }, 400);
  const filter = `${trade ?? ""}|${area ?? ""}|${period}|${contactOnly}`;
  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor ? readFeedCursor(rawCursor, secret) : null;
  if (rawCursor && (!cursor || cursor.filter !== filter || Date.parse(cursor.snapshot) > Date.now() + 60_000))
    return json({ error: "invalid_cursor" }, 400);
  const actionId = url.searchParams.get("action_id");
  if (cursor && (!actionId || !/^[0-9a-f-]{36}$/i.test(actionId))) return json({ error: "action_id_required" }, 400);
  const snapshot = cursor?.snapshot ?? new Date().toISOString();
  const since = period === "all" ? null : new Date(Date.now() - Number(period[0]) * 86_400_000).toISOString();

  let authenticated = false;
  try {
    const auth = await createSupabaseAuthClient();
    const { data: { user } } = await auth.auth.getUser();
    authenticated = Boolean(user);
  } catch { return json({ error: "auth_unavailable" }, 503); }
  if (!authenticated && cursor) return json({ gated: true, jobs: [], has_more: true });

  const { data, error } = await db.rpc("list_public_jobs", {
    filter_trade: trade, filter_area: area, since_at: since,
    before_posted: cursor?.posted ?? null, before_id: cursor?.id ?? null,
    snapshot_at: snapshot, row_limit: JOB_PAGE_SIZE + 1, contact_only: contactOnly
  });
  if (error) return json({ error: "unavailable" }, 503);
  const rows = (data ?? []) as JobRow[];
  const page = rows.slice(0, JOB_PAGE_SIZE);
  const hasMore = rows.length > JOB_PAGE_SIZE;
  const last = page.at(-1);
  const nextCursor = hasMore && last ? signFeedCursor({ snapshot, posted: last.posted_at, id: last.id, filter }, secret) : null;
  return json({ jobs: page, has_more: hasMore, next_cursor: nextCursor, gated: false });
}
