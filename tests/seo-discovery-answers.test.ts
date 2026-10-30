import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Specialist } from "../lib/types";
import { isPublicSeoLocality } from "../lib/public-seo-locality";
import { categoryJsonLd, categoryLocationPath, categoryMetadata, homepageJsonLd, isSeoEligible, matchesCategoryLocation, profileJsonLd, profileLandingLinks, profileMetadata, profilePath, SITE_URL, slugify } from "../lib/seo";
import { buildSeoSitemapEntries } from "../app/sitemap";
import CategoryPage, { generateMetadata } from "../app/[profession]/[location]/page";
import HomepageAnswers from "../components/HomepageAnswers";
import { getSeoSpecialists } from "../lib/specialists";

vi.mock("../lib/specialists", () => ({ getSeoSpecialists: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("NOT_FOUND"); } }));

// Synthetic fixture only, never persisted or fetched from private data.
const profile: Specialist = {
  id: "breadcrumb-public", name: "Rasa Meistrė", companyName: null,
  trade: "Vidaus apdaila", categorySlug: "vidaus-apdaila", categorySlugs: ["vidaus-apdaila"], categoryNames: ["Vidaus apdaila"],
  subcategorySlugs: ["plyteliu-klijavimas", "gipso-kartono-montavimas"], subcategoryNames: ["Plytelių klijavimas", "Gipso kartono montavimas"],
  town: "Vilnius", operatingCities: ["Vilnius"], radius: 50, lat: 54.9, lng: 23.9,
  verification: [], verificationLabel: "", rating: 0, reviewCount: 0, color: "#37503f",
  phone: "+370****0000", email: "rasa@localpro.lt", whatsapp: "", serviceArea: "Vilnius",
  description: "Klijuoju plyteles ir montuoju gipso kartono konstrukcijas. Darbų apimtį ir terminus aptariame individualiai prieš pradėdami projektą.",
  photos: [], reviews: [], status: "approved", source: "self-registration", publicStatus: "public", publicContactConsentAt: "2026-08-01T00:00:00Z", isDemo: false
};
const props = (location: string) => ({ params: Promise.resolve({ profession: "dazytojai", location }) });
beforeEach(() => vi.resetAllMocks());

describe("shared public locality discovery gates", () => {
  it.each(["bažnyčios g.23", "baznycios-g-23", "Vilniaus gatvė", "Vilniaus g.", "Laisvės pr.", "Ąžuolų alėja", "Miško skersgatvis", "Gatvė", "", "   ", "https://example.lt", "!!!", "23"])("suppresses address/non-locality value %s at every SEO boundary", async (city) => {
    const p = { ...profile, operatingCities: [city] };
    vi.mocked(getSeoSpecialists).mockResolvedValue([p]);
    expect(isPublicSeoLocality(city)).toBe(false);
    expect(isSeoEligible(p)).toBe(false);
    expect(categoryLocationPath(p, city)).toBeNull();
    expect(matchesCategoryLocation(p, "dazytojai", slugify(city))).toBe(false);
    expect(profileLandingLinks(p)).toEqual([]);
    expect(categoryMetadata("dazytojai", city, 1).robots).toEqual({ index: false, follow: true });
    expect(categoryJsonLd("dazytojai", city, [p])).toBeNull();
    expect(buildSeoSitemapEntries([p]).map((entry) => entry.url)).toEqual([SITE_URL, `${SITE_URL}/privacy`, `${SITE_URL}/terms`]);
    expect((await generateMetadata(props(slugify(city)))).robots).toEqual({ index: false, follow: true });
    await expect(CategoryPage(props(slugify(city)))).rejects.toThrow("NOT_FOUND");
  });
  it.each(["Vilnius", "Kaunas", "Klaipėda", "Trakų Vokė", "Žemaičių Naumiestis", "Kazlų Rūda", "Šalčininkai", "Giedraičiai", "Šiaulių r.", "Vilnius-Kaunas"])("preserves supported locality labels, routes and server markup: %s", async (city) => {
    const p = { ...profile, operatingCities: [city] };
    vi.mocked(getSeoSpecialists).mockResolvedValue([p]);
    expect(isPublicSeoLocality(city)).toBe(true);
    expect(matchesCategoryLocation(p, "dazytojai", slugify(city))).toBe(true);
    const path = `/dazytojai/${slugify(city)}`;
    expect(profileLandingLinks(p)[0].path).toBe(path);
    expect(buildSeoSitemapEntries([p]).map((entry) => entry.url)).toContain(`${SITE_URL}${path}`);
    expect((await generateMetadata(props(slugify(city)))).alternates?.canonical).toBe(`${SITE_URL}${path}`);
    const html = renderToStaticMarkup(await CategoryPage(props(slugify(city))));
    expect(html).toContain(`href="${profilePath(p)}"`);
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
    expect(json["@graph"][1].itemListElement[0].url).toBe(`${SITE_URL}${profilePath(p)}`);
  });
  it("keeps valid operating areas and stable profile canonicals without changing owner data", async () => {
    const p = { ...profile, operatingCities: ["bažnyčios g.23", "Vilnius", "vilnius", "Trakų Vokė"] };
    const snapshot = structuredClone(p);
    vi.mocked(getSeoSpecialists).mockResolvedValue([p]);
    expect(isSeoEligible(p)).toBe(true);
    expect(profilePath(p)).toBe("/meistrai/rasa-meistre-dazytojas-vilnius-1e97njy");
    expect(profileLandingLinks(p).map((link) => link.path)).toEqual(["/dazytojai/vilnius", "/dazytojai/traku-voke"]);
    const urls = buildSeoSitemapEntries([p]).map((entry) => entry.url);
    expect(urls).toContain(`${SITE_URL}${profilePath(p)}`);
    expect(urls.join(" ")).not.toContain("baznycios");
    expect(profileMetadata(p).description).not.toContain("g.23");
    expect(JSON.stringify(profileJsonLd(p))).not.toContain("g.23");
    expect((await generateMetadata(props("baznycios-g-23"))).robots).toEqual({ index: false, follow: true });
    await expect(CategoryPage(props("baznycios-g-23"))).rejects.toThrow("NOT_FOUND");
    expect(p).toEqual(snapshot);
  });
  it("does not reassign a private-looking base town or change its established canonical path", () => {
    const p = { ...profile, town: "bažnyčios g.23", operatingCities: ["Vilnius"] };
    expect(profilePath(p)).toContain("-baznycios-g-23-");
    expect(profileLandingLinks(p).map((link) => link.city)).toEqual(["Vilnius"]);
    expect(p.town).toBe("bažnyčios g.23");
  });
  it("rejects the observed electrician address URL even when its owner also serves a real town", async () => {
    const p = { ...profile, categorySlug: "elektra-ir-apsauga", trade: "Elektra ir apsaugos sistemos", operatingCities: ["bažnyčios g.23", "Vilnius"] };
    vi.mocked(getSeoSpecialists).mockResolvedValue([p]);
    const invalid = { params: Promise.resolve({ profession: "elektrikai", location: "baznycios-g-23" }) };
    expect((await generateMetadata(invalid)).robots).toEqual({ index: false, follow: true });
    await expect(CategoryPage(invalid)).rejects.toThrow("NOT_FOUND");
    expect(getSeoSpecialists).not.toHaveBeenCalled();
    const valid = { params: Promise.resolve({ profession: "elektrikai", location: "vilnius" }) };
    expect(renderToStaticMarkup(await CategoryPage(valid))).toContain("Elektrikai Vilniuje");
    const urls = buildSeoSitemapEntries([p]).map((entry) => entry.url);
    expect(urls).toContain(`${SITE_URL}/elektrikai/vilnius`);
    expect(urls).not.toContain(`${SITE_URL}/elektrikai/baznycios-g-23`);
  });
  it("filters protected profiles from category JSON-LD even when called independently", () => {
    const privateProfile = { ...profile, id: "private-fixture", publicStatus: "private" as const };
    const data = categoryJsonLd("dazytojai", "Vilnius", [profile, privateProfile])!;
    expect(data["@graph"][1].itemListElement).toHaveLength(1);
    expect(categoryJsonLd("dazytojai", "Vilnius", [privateProfile])).toBeNull();
  });
});

describe("server-rendered homepage answers and platform identity", () => {
  it("renders visible Lithuanian answers with accessible headings and crawlable existing destinations", () => {
    const html = renderToStaticMarkup(createElement(HomepageAnswers));
    expect(html).toContain('aria-labelledby="homepage-answers-title"');
    expect(html).toContain('<h2 id="homepage-answers-title">Kaip veikia LocalPro.lt?</h2>');
    expect((html.match(/<h3>/g) ?? [])).toHaveLength(4);
    for (const href of ["/request", "/darbu-skelbimai", "/meistro-registracija"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("užklausą pirmiausia peržiūri LocalPro administratorius");
    expect(html).toContain("kainą ir terminus aptarkite tiesiogiai");
    expect(html).not.toMatch(/hidden|display:none|nemokam|garantuoj/i);
  });
  it("emits one parseable server JSON-LD graph with linked truthful WebSite/Organization identities", () => {
    const html = renderToStaticMarkup(createElement(HomepageAnswers));
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    const data = JSON.parse(scripts[0][1]);
    expect(data).toEqual(homepageJsonLd());
    const [organization, website] = data["@graph"];
    expect(organization).toEqual({ "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "LocalPro.lt", url: SITE_URL, description: "LocalPro.lt – meistrų paieškos ir darbų užklausų platforma Lietuvoje." });
    expect(website).toEqual({ "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "LocalPro.lt", url: SITE_URL, inLanguage: "lt-LT", publisher: { "@id": organization["@id"] } });
    expect(scripts[0][1]).not.toMatch(/LocalBusiness|address|telephone|aggregateRating|review|price|taxID|legalName|SearchAction|FAQPage/);
    expect(html).toContain(organization.description);
  });
});
