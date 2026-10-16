import type { PublicJobFilters } from "./public-jobs-first-page";

export type FacetJob = { categoryIds: string[]; serviceIds?: string[]; areaIds: string[] };

// Ignore only the facet's own selection, retaining selectable alternatives.
// Deduplicate joins so multiple subcategories never inflate a job count.
export function countPublicJobFacets(jobs: FacetJob[], filters: PublicJobFilters) {
  const trades = new Map<string, number>();
  const areas = new Map<string, number>();
  const services = new Map<string, number>();
  const matches = (ids: string[], selected?: string) => !selected || ids.some((id) => id.toLowerCase() === selected.toLowerCase());
  for (const job of jobs) {
    const areaMatches = !filters.area || job.areaIds.includes(filters.area);
    const categoryMatches = matches(job.categoryIds, filters.trade);
    const serviceMatches = matches(job.serviceIds ?? [], filters.service);
    if (areaMatches && serviceMatches) {
      for (const id of new Set(job.categoryIds)) trades.set(id, (trades.get(id) ?? 0) + 1);
    }
    if (areaMatches && categoryMatches) {
      for (const id of new Set(job.serviceIds ?? [])) services.set(id, (services.get(id) ?? 0) + 1);
    }
    if (categoryMatches && serviceMatches) {
      for (const id of new Set(job.areaIds)) areas.set(id, (areas.get(id) ?? 0) + 1);
    }
  }
  return { trades, areas, services };
}

export function publicJobSince(period: string, now: number) {
  return period === "all" ? null : new Date(now - Number(period[0]) * 86_400_000).toISOString();
}
