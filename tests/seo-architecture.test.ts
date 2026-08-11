import { describe, expect, it } from "vitest";
import type { Specialist } from "../lib/types";
import {
  categoryJsonLd, categoryMetadata, isSeoEligible, matchesCategoryLocation, profileJsonLd,
  profileMetadata, profilePath, profileSeoSlug, safeJsonLd
} from "../lib/seo";
import { buildSeoSitemapEntries } from "../app/sitemap";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoProfileCard } from "../components/seo-profile-card";

const karolina: Specialist = {
  id: "8e16af8b-53c4-41dd-9000-safe-opaque-id", name: "Karolina Marcinkutė", companyName: null,
  trade: "Apdaila", categorySlug: "apdaila", categorySlugs: ["apdaila"], categoryNames: ["Apdaila"],
  publicStatus: "public", subcategorySlugs: ["dazymas", "glaistymas"], subcategoryNames: ["dažymo", "glaistymo"],
  town: "Vilnius", operatingCities: ["Vilnius", "Lentvaris"], radius: 30, lat: 54.6, lng: 25.2,
  verification: ["contact", "portfolio"], verificationLabel: "Kontaktas patvirtintas", rating: 5, reviewCount: 1,
  color: "#37503f", phone: "+37060000000", email: "private@localpro.lt", whatsapp: "37060000000",
  serviceArea: "Vilnius ir Lentvaris", description: "Profesionaliai atlieku vidaus dažymo, glaistymo ir sienų paruošimo darbus Vilniuje bei Lentvaryje.",
  photos: ["Darbas"], photoUrls: ["https://images.localpro.lt/approved.jpg"], reviews: [["Rasa", 5, "Puikus darbas"]],
  status: "approved", source: "self-registration", isDemo: false, publicContactConsentAt: "2026-08-01T10:00:00Z"
};

describe("LocalPro SEO architecture", () => {
  it("indexes only complete, approved, public, consented, non-demo/non-test profiles", () => {
    expect(isSeoEligible(karolina)).toBe(true);
    expect(isSeoEligible({ ...karolina, publicStatus: "private" })).toBe(false);
    expect(isSeoEligible({ ...karolina, status: "pending" })).toBe(false);
    expect(isSeoEligible({ ...karolina, status: "rejected" })).toBe(false);
    expect(isSeoEligible({ ...karolina, isDemo: true })).toBe(false);
    expect(isSeoEligible({ ...karolina, publicContactConsentAt: null })).toBe(false);
    expect(isSeoEligible({ ...karolina, description: "Per trumpas" })).toBe(false);
    expect(isSeoEligible({ ...karolina, name: "Test Builder", email: "test@example.com" })).toBe(false);
  });

  it("generates readable deterministic and collision-safe profile slugs without exposing IDs", () => {
    const slug = profileSeoSlug(karolina);
    expect(slug).toMatch(/^karolina-marcinkute-dazytojas-vilnius-[a-z0-9]{7}$/);
    expect(profileSeoSlug(karolina)).toBe(slug);
    expect(profileSeoSlug({ ...karolina, id: "another-id" })).not.toBe(slug);
    expect(slug).not.toContain(karolina.id);
  });

  it("creates correct canonical profile metadata", () => {
    const metadata = profileMetadata(karolina);
    expect(metadata.title).toBe("Karolina Marcinkutė – Dažytojas Vilniuje | LocalPro");
    expect(metadata.alternates?.canonical).toBe(`https://localpro.lt${profilePath(karolina)}`);
    expect(metadata.description).toContain("dažymo, glaistymo");
  });

  it("matches eligible category/location profiles and excludes ineligible ones", () => {
    expect(matchesCategoryLocation(karolina, "dazytojai", "lentvaris")).toBe(true);
    expect(matchesCategoryLocation({ ...karolina, status: "pending" }, "dazytojai", "lentvaris")).toBe(false);
    expect(matchesCategoryLocation(karolina, "staliai", "trakai")).toBe(false);
  });

  it("noindexes empty/thin category combinations and describes valid pages", () => {
    expect(categoryMetadata("staliai", "Trakai", 0).robots).toEqual({ index: false, follow: true });
    const metadata = categoryMetadata("dazytojai", "Lentvaris", 1);
    expect(metadata.title).toBe("Dažytojai Lentvaryje – patikimi meistrai | LocalPro");
    expect(metadata.alternates?.canonical).toBe("https://localpro.lt/dazytojai/lentvaris");
  });

  it("includes only public visible information in JSON-LD", () => {
    const json = safeJsonLd(profileJsonLd(karolina));
    expect(json).toContain("Karolina Marcinkutė");
    expect(json).toContain("approved.jpg");
    expect(json).not.toContain(karolina.email);
    expect(json).not.toContain(karolina.phone);
    expect(json).not.toContain(karolina.id);
    expect(json).not.toContain("moderation");
  });

  it("builds breadcrumb/item links to crawlable public profile URLs", () => {
    const json = JSON.stringify(categoryJsonLd("dazytojai", "Lentvaris", [karolina]));
    expect(json).toContain(`https://localpro.lt${profilePath(karolina)}`);
    expect(json).not.toContain(karolina.id);
  });

  it("renders a normal crawlable profile link without private fields in landing HTML", () => {
    const html = renderToStaticMarkup(SeoProfileCard({ profile: karolina }));
    expect(html).toContain(`href="${profilePath(karolina)}"`);
    expect(html).toContain("Karolina Marcinkutė");
    expect(html).not.toContain(karolina.email);
    expect(html).not.toContain(karolina.phone);
    expect(html).not.toContain(karolina.id);
  });

  it("sitemap includes eligible profile and non-empty landing URLs", () => {
    const urls = buildSeoSitemapEntries([karolina]).map((entry) => entry.url);
    expect(urls).toContain(`https://localpro.lt${profilePath(karolina)}`);
    expect(urls).toContain("https://localpro.lt/dazytojai/lentvaris");
    expect(buildSeoSitemapEntries([]).some((entry) => entry.url.includes("/dazytojai/"))).toBe(false);
    expect(buildSeoSitemapEntries([{ ...karolina, publicStatus: "private" }]).some((entry) => entry.url.includes("karolina"))).toBe(false);
  });
});
