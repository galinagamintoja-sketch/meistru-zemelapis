import { beforeEach, describe, expect, it, vi } from "vitest";
import { countPublicJobFacets, publicJobSince } from "../lib/public-jobs-facets";

const { db } = vi.hoisted(() => ({ db: { from: vi.fn() } }));
vi.mock("../lib/supabase", () => ({ createServerSupabase: () => db }));
import { getPublicJobPage, getPublicJobTaxonomy, publicJobFilters } from "../lib/public-jobs-first-page";
const defaults = { trade: "", area: "", period: "all", contactOnly: false };
const jobs = [
  { categoryIds: ["interior", "interior", "electrical"], areaIds: ["kaunas", "kaunas"] },
  { categoryIds: ["interior"], areaIds: ["vilnius"] },
  { categoryIds: ["plumbing"], areaIds: ["kaunas", "kauno-rajonas"] },
  { categoryIds: ["electrical"], areaIds: [] }
];

describe("job facets", () => {
  it("treats valid UUID category selections case-insensitively", () => {
    const id = "23afad17-ae02-48fc-9891-8d0a33fd83d8";
    const rows = [{ categoryIds: [id], areaIds: ["vilnius"] }];
    expect(countPublicJobFacets(rows, { ...defaults, trade: id.toUpperCase() }).areas.get("vilnius")).toBe(1);
    expect(publicJobFilters({ trade: id.toUpperCase() })?.trade).toBe(id);
  });
  it("counts nationwide jobs once per category/area, including unknown-location jobs only nationwide", () => {
    const result = countPublicJobFacets(jobs, defaults);
    expect(Object.fromEntries(result.trades)).toEqual({ interior: 2, electrical: 2, plumbing: 1 });
    expect(Object.fromEntries(result.areas)).toEqual({ kaunas: 2, vilnius: 1, "kauno-rajonas": 1 });
  });
  it.each(["kaunas", "vilnius", "kauno-rajonas", "unknown"])("scopes all categories to exact area %s", (area) => {
    const result = countPublicJobFacets(jobs, { ...defaults, area });
    const expected: Record<string, Record<string, number>> = {
      kaunas: { interior: 1, electrical: 1, plumbing: 1 }, vilnius: { interior: 1 },
      "kauno-rajonas": { plumbing: 1 }, unknown: {}
    };
    expect(Object.fromEntries(result.trades)).toEqual(expected[area]);
  });
  it("keeps alternative categories/cities while respecting every other facet", () => {
    const result = countPublicJobFacets(jobs, { ...defaults, area: "kaunas", trade: "interior" });
    expect(Object.fromEntries(result.trades)).toEqual({ interior: 1, electrical: 1, plumbing: 1 });
    expect(Object.fromEntries(result.areas)).toEqual({ kaunas: 1, vilnius: 1 });
  });
  it.each([1, 3, 7])("uses a rolling %i day window", (days) => {
    expect(publicJobSince(`${days}d`, Date.parse("2026-10-10T12:00:00Z"))).toBe(new Date(Date.parse("2026-10-10T12:00:00Z") - days * 86400000).toISOString());
  });
});

function query(data: unknown[]) {
  const q = { select: vi.fn(), eq: vi.fn(), gt: vi.fn(), gte: vi.fn(), lte: vi.fn(), order: vi.fn(), range: vi.fn(), limit: vi.fn(),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
  for (const method of [q.select, q.eq, q.gt, q.gte, q.lte, q.order, q.range, q.limit]) method.mockReturnValue(q);
  return q;
}

describe("database filtering", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.LOCALPRO_JOBS_CURSOR_SECRET = "filter-tests-only-secret-with-more-than-32-characters"; });
  it("applies date, phone, visibility and expiry before computing city-scoped counts", async () => {
    const categories = query([{ id: "interior", name: "Interior" }, { id: "plumbing", name: "Plumbing" }]);
    const areas = query([{ id: "kaunas", name: "Kaunas", kind: "city" }, { id: "vilnius", name: "Vilnius", kind: "city" }]);
    const records = query([
      { public_job_trades: [{ service_subcategories: { service_category_id: "interior" } }, { service_subcategories: { service_category_id: "interior" } }], public_job_areas: [{ area_id: "kaunas" }] },
      { public_job_trades: [{ service_subcategories: { service_category_id: "plumbing" } }], public_job_areas: [{ area_id: "vilnius" }] }
    ]);
    db.from.mockImplementation((table: string) => table === "service_categories" ? categories : table === "job_areas" ? areas : records);
    const result = await getPublicJobTaxonomy({ ...defaults, area: "kaunas", period: "3d", contactOnly: true });
    expect(result?.trades.map((item) => item.count)).toEqual([1, 0]);
    expect(records.eq).toHaveBeenCalledWith("status", "active");
    expect(records.eq).toHaveBeenCalledWith("has_contact_number", true);
    expect(records.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    expect(records.gte).toHaveBeenCalledWith("posted_at", expect.any(String));
  });
  it("loads all pages of counts rather than only the six displayed jobs", async () => {
    const record = { public_job_trades: [{ service_subcategories: { service_category_id: "interior" } }], public_job_areas: [{ area_id: "kaunas" }] };
    const records = query([]);
    records.then = vi.fn().mockImplementationOnce((resolve) => Promise.resolve({ data: Array(500).fill(record), error: null }).then(resolve))
      .mockImplementationOnce((resolve) => Promise.resolve({ data: [record], error: null }).then(resolve));
    db.from.mockImplementation((table: string) => table === "public_jobs" ? records : query([{ id: "interior", name: "Interior" }]));
    expect((await getPublicJobTaxonomy({ ...defaults, area: "kaunas" }))?.trades[0].count).toBe(501);
    expect(records.range).toHaveBeenNthCalledWith(2, 500, 999);
  });
  it("ANDs category, area, date and phone in the actual listing query without restricting displayed metadata", async () => {
    const records = query([]); db.from.mockReturnValue(records);
    await getPublicJobPage({ trade: "category-id", area: "kaunas", period: "7d", contactOnly: true });
    expect(records.eq).toHaveBeenCalledWith("category_filter.service_subcategories.service_category_id", "category-id");
    expect(records.eq).toHaveBeenCalledWith("area_filter.area_id", "kaunas");
    expect(records.eq).toHaveBeenCalledWith("has_contact_number", true);
    expect(records.gte).toHaveBeenCalledWith("posted_at", expect.any(String));
    expect(records.select).toHaveBeenCalledWith(expect.stringContaining("category_filter:public_job_trades!inner(service_subcategories!inner(service_category_id))"));
    expect(records.select).toHaveBeenCalledWith(expect.stringContaining("area_filter:public_job_areas!inner(area_id)"));
  });
});
