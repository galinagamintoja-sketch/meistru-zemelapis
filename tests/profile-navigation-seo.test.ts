import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Specialist } from "../lib/types";
import { profileBreadcrumbJsonLd, profileHeading, profileJsonLd, profileLandingLinks, profileMetadata, profilePath, SITE_URL } from "../lib/seo";
import { getPublicSpecialistBySeoSlug, getSeoSpecialists } from "../lib/specialists";
import Page, { generateMetadata } from "../app/meistrai/[slug]/page";
import CategoryPage from "../app/[profession]/[location]/page";

vi.mock("../lib/specialists", () => ({ getPublicSpecialistBySeoSlug: vi.fn(), getSeoSpecialists: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("NOT_FOUND"); }, permanentRedirect: (url: string) => { throw Error(`REDIRECT:${url}`); } }));
vi.mock("../components/PublicProfileGallery", () => ({ default: () => null }));
vi.mock("../components/profile-report-form", () => ({ ProfileReportForm: () => null }));

// Synthetic regression fixture; not inserted into any database.
const profile: Specialist = {
  id: "opaque-navigation-fixture", name: "Rasa Meistrė", companyName: null,
  trade: "Vidaus apdaila", categorySlug: "vidaus-apdaila", categorySlugs: ["vidaus-apdaila"], categoryNames: ["Vidaus apdaila"],
  subcategorySlugs: ["plyteliu-klijavimas", "gipso-kartono-montavimas"], subcategoryNames: ["Plytelių klijavimas", "Gipso kartono montavimas"],
  town: "Kaunas", operatingCities: ["Vilnius", "Kaunas"], radius: 50, lat: 54.9, lng: 23.9,
  verification: [], verificationLabel: "", rating: 0, reviewCount: 0, color: "#37503f",
  phone: "+37060000000", email: "rasa@localpro.lt", whatsapp: "", serviceArea: "Vilnius, Kaunas",
  description: "Klijuoju plyteles ir montuoju gipso kartono konstrukcijas. Darbų apimtį ir terminus aptariame individualiai prieš pradėdami projektą.",
  photos: [], reviews: [], status: "approved", source: "self-registration", publicStatus: "public", publicContactConsentAt: "2026-08-01T00:00:00Z", isDemo: false
};
const props = (p: Specialist) => ({ params: Promise.resolve({ slug: profilePath(p).split("/").pop()! }), searchParams: Promise.resolve({ return: "/?locality=anywhere#results" }) });
beforeEach(() => vi.resetAllMocks());

describe("canonical public profile breadcrumbs", () => {
  it("uses home, the real mapped category/location route, and the unchanged profile canonical", () => {
    const data = profileBreadcrumbJsonLd(profile)!;
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data["@id"]).toBe(`${SITE_URL}${profilePath(profile)}#breadcrumb`);
    expect(data.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "LocalPro", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Vidaus apdaila – Kaunas", item: `${SITE_URL}/dazytojai/kaunas` },
      { "@type": "ListItem", position: 3, name: profile.name, item: `${SITE_URL}${profilePath(profile)}` }
    ]);
    expect(data.itemListElement.map((i) => i.item).join(" ")).not.toMatch(/\?|#results|opaque-navigation-fixture/);
  });
  it("proves the parent renders using the actual category route and the same public snapshot", async () => {
    vi.mocked(getSeoSpecialists).mockResolvedValue([profile]);
    const html = renderToStaticMarkup(await CategoryPage({ params: Promise.resolve({ profession: "dazytojai", location: "kaunas" }) }));
    expect(html).toContain(`href="${profilePath(profile)}"`);
    expect(html).toContain("Rasa Meistrė");
  });
  it("falls back to home/profile when no mapped category route exists", () => {
    const p = { ...profile, trade: "Statyba ir konstrukcijos", categorySlug: "statyba-ir-konstrukcijos" };
    expect(profileLandingLinks(p)).toEqual([]);
    expect(profileBreadcrumbJsonLd(p)!.itemListElement.map((i) => i.item)).toEqual([SITE_URL, `${SITE_URL}${profilePath(p)}`]);
  });
  it("does not invent standalone category/city paths or links to empty landing combinations", () => {
    const p = { ...profile, description: "Trumpas aprašymas" };
    expect(profileLandingLinks(p)).toEqual([]);
    expect(profileBreadcrumbJsonLd(p)!.itemListElement).toHaveLength(2);
  });
  it("uses an actual operating locality if the base town is not one of the available route localities", () => {
    expect(profileLandingLinks({ ...profile, town: "Trakai", operatingCities: ["Vilnius"] })[0].path).toBe("/dazytojai/vilnius");
  });
  it("excludes address-like, empty and duplicate parent paths", () => {
    const links = profileLandingLinks({ ...profile, operatingCities: ["", "Kaunas", "kaunas", "Vilniaus g. 10"] });
    expect(links).toHaveLength(1);
    expect(links[0].path).toBe("/dazytojai/kaunas");
  });
  it("uses the public company display name without claiming a verified business", () => {
    const p = { ...profile, companyName: "MB Vieši darbai" };
    expect(profileBreadcrumbJsonLd(p)!.itemListElement.at(-1)?.name).toBe(p.companyName);
    expect(profileJsonLd(p)!.mainEntity["@type"]).toBe("Person");
  });
  it.each([{ publicStatus: "private" }, { status: "pending" }, { status: "rejected" }, { isDemo: true }, { publicContactConsentAt: null }, { email: "test@example.com" }] as Partial<Specialist>[])("suppresses breadcrumbs for protected profiles: %j", (change) => {
    expect(profileBreadcrumbJsonLd({ ...profile, ...change })).toBeNull();
  });
  it("renders one JSON-LD script with exactly one embedded breadcrumb and matching visible names/links", async () => {
    vi.mocked(getPublicSpecialistBySeoSlug).mockResolvedValue(profile);
    const html = renderToStaticMarkup(await Page(props(profile)));
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    const data = JSON.parse(scripts[0][1]);
    expect(data.breadcrumb).toEqual(profileBreadcrumbJsonLd(profile));
    expect((scripts[0][1].match(/"@type":"BreadcrumbList"/g) ?? [])).toHaveLength(1);
    expect(html).toContain('aria-label="Naršymo kelias"');
    expect(html).toContain(`href="${SITE_URL}/dazytojai/kaunas"`);
    expect(html).toContain('aria-current="page">Rasa Meistrė');
    expect(data.url).toBe((await generateMetadata(props(profile))).alternates?.canonical);
  });
  it("still renders breadcrumbs if an unverified company-only profile has no supported Person entity", async () => {
    const p = { ...profile, name: "", companyName: "Vieši darbai" };
    vi.mocked(getPublicSpecialistBySeoSlug).mockResolvedValue(p);
    const html = renderToStaticMarkup(await Page(props(p)));
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0][1])["@type"]).toBe("BreadcrumbList");
  });
});

describe("public profile SEO consistency", () => {
  it("uses the visible category/location in H1, title and JSON-LD without changing the legacy canonical", () => {
    const heading = "Rasa Meistrė – Vidaus apdaila · Kaunas";
    expect(profileHeading(profile)).toBe(heading);
    expect(profileMetadata(profile).title).toBe(`${heading} | LocalPro`);
    expect(profileJsonLd(profile)!.name).toBe(heading);
    expect(profilePath(profile)).toMatch(/\/meistrai\/rasa-meistre-dazytojas-kaunas-[a-z0-9]{7}$/);
    expect(profilePath({ ...profile, id: "breadcrumb-public", town: "Vilnius" })).toBe("/meistrai/rasa-meistre-dazytojas-vilnius-1e97njy");
    expect(profileMetadata(profile).title).not.toContain("Dažytojas");
  });
  it("never exposes internal service slugs when public labels are missing", () => {
    const p = { ...profile, subcategoryNames: undefined };
    const metadata = profileMetadata(p);
    expect(metadata.description).not.toContain("plyteliu-klijavimas");
    expect(metadata.description).toContain("Vidaus apdaila");
    expect(profileJsonLd(p)!.mainEntity).not.toHaveProperty("makesOffer");
  });
  it("uses one supported summary for search and social metadata instead of amplifying an unrelated description", () => {
    const p = { ...profile, description: "Kuriu internetines svetaines ir el. parduotuves." };
    const metadata = profileMetadata(p);
    expect(metadata.description).toContain("Plytelių klijavimas");
    expect(metadata.description).not.toContain("svetaines");
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.twitter?.description).toBe(metadata.description);
    expect(profileJsonLd(p)!.mainEntity.description).toBe(p.description); // Do not rewrite user content.
  });
  it("keeps noindex rules for thin profiles independently of navigation/schema availability", async () => {
    const p = { ...profile, description: "Trumpas aprašymas" };
    vi.mocked(getPublicSpecialistBySeoSlug).mockResolvedValue(p);
    expect((await generateMetadata(props(p))).robots).toEqual({ index: false, follow: true });
  });
  it("preserves all valid multi-trade service labels and visible categories", async () => {
    const p = { ...profile, categoryNames: ["Vidaus apdaila", "Santechnika"], categorySlugs: ["vidaus-apdaila", "santechnika"],
      subcategoryNames: [...profile.subcategoryNames!, "Vamzdynų montavimas"], subcategorySlugs: [...profile.subcategorySlugs, "vamzdynu-montavimas"] };
    vi.mocked(getPublicSpecialistBySeoSlug).mockResolvedValue(p);
    const html = renderToStaticMarkup(await Page(props(p)));
    expect(html).toContain("Vidaus apdaila · Santechnika");
    for (const name of p.subcategoryNames) expect(html).toContain(`<li>${name}</li>`);
    expect((profileJsonLd(p)!.mainEntity.makesOffer as unknown[])).toHaveLength(3);
  });
});
