import { createServerSupabase } from "./supabase";
import { JOB_PAGE_SIZE } from "./public-jobs-import";
import { signFeedCursor } from "./public-jobs-cursor";

export type PublicJobFilters = { trade: string; area: string; period: string; contactOnly: boolean };
export type PublicJob = {
  id: string; title: string; summary: string; source_url: string; source_name?: string | null;
  has_contact_number: boolean; posted_at: string;
  trades: Array<{ id: string; name: string }>;
  areas: Array<{ id: string; name: string; kind: string }>;
};
export type FirstJobPage = { jobs: PublicJob[]; next_cursor: string | null; has_more: boolean; gated: false };
export type PublicJobTaxonomy = { trades: Array<{ id: string; name: string; slug: string }>; areas: Array<{ id: string; name: string; kind: string }> };

export function publicJobFilters(params: Record<string, string | string[] | undefined>): PublicJobFilters | null {
  const single = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const trade = single("trade");
  const area = single("area");
  const period = single("period") || "all";
  const contact = single("contact_number");
  if ((trade && !/^[0-9a-f-]{36}$/i.test(trade)) || (area && !/^[a-z0-9-]{2,80}$/.test(area)) ||
    !["all", "1d", "3d", "7d"].includes(period) || (contact && !["true", "false"].includes(contact))) return null;
  return { trade, area, period, contactOnly: contact === "true" };
}

export async function getFirstPublicJobPage(filters: PublicJobFilters): Promise<FirstJobPage | null> {
  const secret = process.env.LOCALPRO_JOBS_CURSOR_SECRET;
  if (!secret || secret.length < 32) return null;
  const db = createServerSupabase();
  if (!db) return null;
  const snapshot = new Date().toISOString();
  const since = filters.period === "all" ? null : new Date(Date.now() - Number(filters.period[0]) * 86_400_000).toISOString();
  const { data, error } = await db.rpc("list_public_jobs", {
    filter_trade: filters.trade || null, filter_area: filters.area || null, since_at: since,
    before_posted: null, before_id: null, snapshot_at: snapshot,
    row_limit: JOB_PAGE_SIZE + 1, contact_only: filters.contactOnly
  });
  if (error) return null;
  const rows = (data ?? []) as PublicJob[];
  const jobs = rows.slice(0, JOB_PAGE_SIZE);
  const hasMore = rows.length > JOB_PAGE_SIZE;
  const last = jobs.at(-1);
  const filter = `${filters.trade}|${filters.area}|${filters.period}|${filters.contactOnly}`;
  return { jobs, has_more: hasMore, next_cursor: hasMore && last ? signFeedCursor({ snapshot, posted: last.posted_at, id: last.id, filter }, secret) : null, gated: false };
}

export async function getPublicJobTaxonomy(): Promise<PublicJobTaxonomy | null> {
  const db = createServerSupabase();
  if (!db) return null;
  const [trades, areas] = await Promise.all([
    db.from("service_subcategories").select("id,name,slug").eq("is_active", true).order("name"),
    db.from("job_areas").select("id,name,kind").eq("is_active", true).order("name")
  ]);
  if (trades.error || areas.error) return null;
  return { trades: trades.data ?? [], areas: areas.data ?? [] };
}
