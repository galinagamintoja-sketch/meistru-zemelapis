import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "../../../../lib/supabase-ssr";
import { readFeedCursor } from "../../../../lib/public-jobs-cursor";
import { getPublicJobPage, getPublicJobTaxonomy, publicJobFilterKey, type PublicJobFilters } from "../../../../lib/public-jobs-first-page";
import { getLinkedTradespersonProfile } from "../../../../lib/tradesperson-account";

export const dynamic = "force-dynamic";
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  const secret = process.env.LOCALPRO_JOBS_CURSOR_SECRET;
  if (!secret || secret.length < 32) return json({ error: "unavailable" }, 503);
  const url = new URL(request.url);
  const trade = url.searchParams.get("trade")?.toLowerCase() || null;
  const area = url.searchParams.get("area") || null;
  const period = url.searchParams.get("period") || "all";
  const contactOnly = url.searchParams.get("contact_number") === "true";
  if (trade && !/^[0-9a-f-]{36}$/i.test(trade) || area && !/^[a-z0-9-]{2,80}$/.test(area) ||
    !["all", "1d", "3d", "7d"].includes(period) ||
    (url.searchParams.has("contact_number") && !["true", "false"].includes(url.searchParams.get("contact_number") ?? "")))
    return json({ error: "invalid_filter" }, 400);
  const filters: PublicJobFilters = { trade: trade ?? "", area: area ?? "", period, contactOnly };
  const filter = publicJobFilterKey(filters);
  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor ? readFeedCursor(rawCursor, secret) : null;
  if (rawCursor && (!cursor || cursor.filter !== filter || Date.parse(cursor.snapshot) > Date.now() + 60_000))
    return json({ error: "invalid_cursor" }, 400);
  const actionId = url.searchParams.get("action_id");
  if (cursor && (!actionId || !/^[0-9a-f-]{36}$/i.test(actionId))) return json({ error: "action_id_required" }, 400);
  let userId: string | null = null;
  try {
    const auth = await createSupabaseAuthClient();
    const { data: { user } } = await auth.auth.getUser();
    userId = user?.id ?? null;
  } catch { return json({ error: "auth_unavailable" }, 503); }
  if (cursor && !userId) return json({ gated: true, jobs: [], has_more: true });
  if (cursor && userId && !(await getLinkedTradespersonProfile(userId))) {
    return json({ gated: true, profile_required: true, jobs: [], has_more: true });
  }
  const [page, taxonomy] = await Promise.all([
    getPublicJobPage(filters, cursor ?? undefined),
    cursor ? Promise.resolve(undefined) : getPublicJobTaxonomy(filters)
  ]);
  if (!page || taxonomy === null) return json({ error: "unavailable" }, 503);
  return json({ ...page, ...(taxonomy ? { taxonomy } : {}) });
}
