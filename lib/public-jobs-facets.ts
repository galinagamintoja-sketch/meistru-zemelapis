import type { PublicJobFilters } from "./public-jobs-first-page";

export type FacetJob = { categoryIds: string[]; areaIds: string[] };

// Ignore only the facet's own selection, retaining selectable alternatives.
// Deduplicate joins so multiple subcategories never inflate a job count.
export function countPublicJobFacets(jobs: FacetJob[], filters: PublicJobFilters) {
  const trades = new Map<string, number>();
  const areas = new Map<string, number>();
  for (const job of jobs) {
    if (!filters.area || job.areaIds.includes(filters.area)) {
      for (const id of new Set(job.categoryIds)) trades.set(id, (trades.get(id) ?? 0) + 1);
    }
    if (!filters.trade || job.categoryIds.some((id) => id.toLowerCase() === filters.trade.toLowerCase())) {
      for (const id of new Set(job.areaIds)) areas.set(id, (areas.get(id) ?? 0) + 1);
    }
  }
  return { trades, areas };
}

export function publicJobSince(period: string, now: number) {
  return period === "all" ? null : new Date(now - Number(period[0]) * 86_400_000).toISOString();
}
