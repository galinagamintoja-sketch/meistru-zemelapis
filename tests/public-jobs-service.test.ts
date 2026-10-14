import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { signFeedCursor } from "../lib/public-jobs-cursor";

const mocks = vi.hoisted(() => ({ page: vi.fn(), taxonomy: vi.fn() }));
vi.mock("../lib/public-jobs-first-page", async (original) => ({
  ...await original<typeof import("../lib/public-jobs-first-page")>(),
  getPublicJobPage: mocks.page,
  getFirstPublicJobPage: mocks.page,
  getPublicJobTaxonomy: mocks.taxonomy
}));
vi.mock("../lib/supabase-ssr", () => ({ createSupabaseAuthClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { GET as feed } from "../app/api/jobs/feed/route";
import { GET as taxonomyRoute } from "../app/api/jobs/taxonomy/route";
import JobsPage from "../app/darbu-skelbimai/page";
import JobsPageClient from "../components/JobsPageClient";
import { publicJobFilterKey } from "../lib/public-jobs-first-page";

const service = "23afad17-ae02-48fc-9891-8d0a33fd83d8";
const category = "1394b83a-e47c-45f3-8888-a114ef045ab3";
const secret = "service-filter-tests-secret-with-more-than-32-characters";
const filters = { trade: category, service, area: "kaunas", period: "3d", contactOnly: true };
const firstPage = { jobs: [], next_cursor: null, has_more: false, gated: false as const };
const taxonomy = { trades: [{ id: category, name: "Apdaila", count: 0 }], areas: [], services: [
  { id: service, name: "Dekoratyvinis tinkavimas", category_id: category, count: 0 },
  { id: "28f109be-eccd-4a6b-b153-b57fbb1bdf00", name: "Other category service", category_id: "other", count: 1 }
] };
const query = () => new URLSearchParams({ trade: category, service: service.toUpperCase(), area: "kaunas", period: "3d", contact_number: "true" });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LOCALPRO_JOBS_CURSOR_SECRET = secret;
  mocks.page.mockResolvedValue(firstPage);
  mocks.taxonomy.mockResolvedValue(taxonomy);
});

describe("public service filter integration", () => {
  it("passes the same normalized service filter through SSR, feed and taxonomy", async () => {
    const element = await JobsPage({ searchParams: Promise.resolve(Object.fromEntries(query())) });
    expect(element.props.initialFilters).toEqual(filters);
    expect(mocks.page).toHaveBeenCalledWith(filters);
    expect(mocks.taxonomy).toHaveBeenCalledWith(filters);
    expect((await feed(new Request(`http://localhost/api/jobs/feed?${query()}`))).status).toBe(200);
    expect(mocks.page).toHaveBeenLastCalledWith(filters, undefined);
    const response = await taxonomyRoute(new Request(`http://localhost/api/jobs/taxonomy?${query()}`));
    expect(response.status).toBe(200);
    expect((await response.json()).services[0]).toEqual(taxonomy.services[0]);
  });
  it("rejects invalid service values consistently before DB requests", async () => {
    expect((await feed(new Request("http://localhost/api/jobs/feed?service=plaster"))).status).toBe(400);
    expect((await taxonomyRoute(new Request("http://localhost/api/jobs/taxonomy?service=plaster"))).status).toBe(400);
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.taxonomy).not.toHaveBeenCalled();
  });
  it("rejects cursor reuse across services and preserves pagination access gates", async () => {
    const cursor = signFeedCursor({ snapshot: new Date().toISOString(), posted: new Date().toISOString(), id: service,
      filter: publicJobFilterKey(filters) }, secret);
    const params = query(); params.set("cursor", cursor); params.set("action_id", service);
    const gated = await feed(new Request(`http://localhost/api/jobs/feed?${params}`));
    expect(await gated.json()).toMatchObject({ gated: true });
    params.set("service", category);
    expect((await feed(new Request(`http://localhost/api/jobs/feed?${params}`))).status).toBe(400);
    params.delete("service");
    expect((await feed(new Request(`http://localhost/api/jobs/feed?${params}`))).status).toBe(400);
    expect(mocks.page).not.toHaveBeenCalled();
  });
  it("renders the Lithuanian service dropdown, DB name, selected zero count and category-scoped alternatives", () => {
    const markup = renderToStaticMarkup(createElement(JobsPageClient, { initialFilters: filters, initialTaxonomy: taxonomy, initialFeed: firstPage }));
    expect(markup).toContain("Paslauga<select");
    expect(markup).toContain("Visos paslaugos");
    expect(markup).toContain(`value="${service}" selected=""`);
    expect(markup).toContain("Dekoratyvinis tinkavimas (0)");
    expect(markup).not.toContain("Other category service");
    expect(markup).toContain("Išvalyti filtrus");
  });
});
