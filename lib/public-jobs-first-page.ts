import { createServerSupabase } from "./supabase";
import { countPublicJobFacets, publicJobSince, type FacetJob } from "./public-jobs-facets";
import { JOB_PAGE_SIZE } from "./public-jobs-import";
import { signFeedCursor, type FeedCursor } from "./public-jobs-cursor";

export type PublicJobFilters = { trade: string; area: string; period: string; contactOnly: boolean };
export type PublicJob = {
  id: string; title: string; summary: string; source_url: string; source_name?: string | null;
  has_contact_number: boolean; posted_at: string;
  trades: Array<{ id: string; name: string }>;
  areas: Array<{ id: string; name: string; kind: string }>;
};
export type FirstJobPage = { jobs: PublicJob[]; next_cursor: string | null; has_more: boolean; gated: false };
export type PublicJobTaxonomy = {
  trades: Array<{ id: string; name: string; count: number }>;
  areas: Array<{ id: string; name: string; kind: string; count: number }>;
};

type JobRecord = Omit<PublicJob, "trades" | "areas"> & {
  trades: Array<{ service_subcategories: { id: string; name: string } | null }>;
  areas: Array<{ job_areas: { id: string; name: string; kind: string } | null }>;
};

export function publicJobFilters(params: Record<string, string | string[] | undefined>): PublicJobFilters | null {
  const single = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const trade = single("trade").toLowerCase();
  const area = single("area");
  const period = single("period") || "all";
  const contact = single("contact_number");
  if ((trade && !/^[0-9a-f-]{36}$/i.test(trade)) || (area && !/^[a-z0-9-]{2,80}$/.test(area)) ||
    !["all", "1d", "3d", "7d"].includes(period) || (contact && !["true", "false"].includes(contact))) return null;
  return { trade, area, period, contactOnly: contact === "true" };
}

export function publicJobFilterKey(filters: PublicJobFilters) {
  return `${filters.trade}|${filters.area}|${filters.period}|${filters.contactOnly}`;
}

export async function getPublicJobPage(filters: PublicJobFilters, cursor?: FeedCursor): Promise<FirstJobPage | null> {
  const secret = process.env.LOCALPRO_JOBS_CURSOR_SECRET;
  if (!secret || secret.length < 32) return null;
  const db = createServerSupabase();
  if (!db) return null;
  const snapshot = cursor?.snapshot ?? new Date().toISOString();
  const since = publicJobSince(filters.period, Date.now());
  const select = [
    "id,title,summary,source_url,source_name,has_contact_number,posted_at",
    "trades:public_job_trades(service_subcategories(id,name))",
    "areas:public_job_areas(job_areas(id,name,kind))",
    filters.trade ? "category_filter:public_job_trades!inner(service_subcategories!inner(service_category_id))" : "",
    filters.area ? "area_filter:public_job_areas!inner(area_id)" : ""
  ].filter(Boolean).join(",");
  let query = db.from("public_jobs").select(select)
    .eq("status", "active").gt("expires_at", new Date().toISOString()).lte("created_at", snapshot)
    .order("posted_at", { ascending: false }).order("id", { ascending: false }).limit(JOB_PAGE_SIZE + 1);
  if (since) query = query.gte("posted_at", since);
  if (filters.contactOnly) query = query.eq("has_contact_number", true);
  if (filters.trade) query = query.eq("category_filter.service_subcategories.service_category_id", filters.trade);
  if (filters.area) query = query.eq("area_filter.area_id", filters.area);
  if (cursor) query = query.or(`posted_at.lt.${cursor.posted},and(posted_at.eq.${cursor.posted},id.lt.${cursor.id})`);
  const { data, error } = await query;
  if (error) return null;
  const rows = (data ?? []) as unknown as JobRecord[];
  const jobs = rows.slice(0, JOB_PAGE_SIZE).map((row): PublicJob => ({
    id: row.id, title: row.title, summary: row.summary, source_url: row.source_url,
    source_name: row.source_name, has_contact_number: row.has_contact_number, posted_at: row.posted_at,
    trades: row.trades.flatMap((item) => item.service_subcategories ? [item.service_subcategories] : []),
    areas: row.areas.flatMap((item) => item.job_areas ? [item.job_areas] : [])
  }));
  const hasMore = rows.length > JOB_PAGE_SIZE;
  const last = jobs.at(-1);
  return {
    jobs, has_more: hasMore,
    next_cursor: hasMore && last ? signFeedCursor({ snapshot, posted: last.posted_at, id: last.id, filter: publicJobFilterKey(filters) }, secret) : null,
    gated: false
  };
}

export const getFirstPublicJobPage = (filters: PublicJobFilters) => getPublicJobPage(filters);

export async function getPublicJobTaxonomy(filters: PublicJobFilters = { trade: "", area: "", period: "all", contactOnly: false }): Promise<PublicJobTaxonomy | null> {
  const db = createServerSupabase();
  if (!db) return null;
  const [categories, areas] = await Promise.all([
    db.from("service_categories").select("id,name,sort_order").eq("is_active", true).order("sort_order"),
    db.from("job_areas").select("id,name,kind").eq("is_active", true).order("name")
  ]);
  if (categories.error || areas.error) return null;
  const facetJobs: FacetJob[] = [];
  const now = new Date().toISOString();
  const since = publicJobSince(filters.period, Date.parse(now));
  for (let offset = 0; ; offset += 500) {
    let query = db.from("public_jobs")
      .select("id,public_job_trades(service_subcategories(service_category_id)),public_job_areas(area_id)")
      .eq("status", "active").gt("expires_at", now).order("id").range(offset, offset + 499);
    if (since) query = query.gte("posted_at", since);
    if (filters.contactOnly) query = query.eq("has_contact_number", true);
    const { data, error } = await query;
    if (error || !data) return null;
    for (const job of data) {
      const categoryIds = new Set(job.public_job_trades.map((item) => {
        const subcategory = Array.isArray(item.service_subcategories) ? item.service_subcategories[0] : item.service_subcategories;
        return subcategory?.service_category_id;
      }).filter((id): id is string => Boolean(id)));
      facetJobs.push({ categoryIds: [...categoryIds], areaIds: job.public_job_areas.map((item) => item.area_id) });
    }
    if (data.length < 500) break;
  }
  const counts = countPublicJobFacets(facetJobs, filters);
  return {
    trades: (categories.data ?? []).map((item) => ({ id: item.id, name: item.name, count: counts.trades.get(item.id) ?? 0 })),
    areas: (areas.data ?? []).map((item) => ({ id: item.id, name: item.name, kind: item.kind, count: counts.areas.get(item.id) ?? 0 }))
  };
}
