import type { PublicJobFilters, PublicJobTaxonomy } from "./public-jobs-first-page";

// Only public facet labels/counts are shared, never job bodies, auth decisions,
// profiles or cursors. Counts can lag at most 15 seconds on a warm instance.
// The actual feed still checks active/expiry and access on every request.
export function createPublicTaxonomyCache(load: (filters: PublicJobFilters) => Promise<PublicJobTaxonomy | null>, now = Date.now) {
  let generation = 0;
  const values = new Map<string, { expires: number; data: PublicJobTaxonomy }>();
  const pending = new Map<string, Promise<PublicJobTaxonomy | null>>();
  const clone = (data: PublicJobTaxonomy | null) => data === null ? null : structuredClone(data);
  const read = async (filters: PublicJobFilters): Promise<PublicJobTaxonomy | null> => {
    const key = JSON.stringify([filters.trade, filters.service ?? "", filters.area, filters.period, filters.contactOnly]);
    const found = values.get(key);
    if (found && found.expires > now()) return clone(found.data);
    values.delete(key);
    let work = pending.get(key);
    if (!work) {
      const startedGeneration = generation;
      work = load(filters).then((data) => {
        if (data !== null && startedGeneration === generation) {
          if (values.size >= 64) values.delete(values.keys().next().value!);
          values.set(key, { expires: now() + 15_000, data: structuredClone(data) });
        }
        return data;
      }).finally(() => { if (pending.get(key) === work) pending.delete(key); });
      if (pending.size >= 64) pending.delete(pending.keys().next().value!);
      pending.set(key, work);
    }
    return clone(await work);
  };
  return Object.assign(read, { clear: () => { generation++; values.clear(); pending.clear(); } });
}
