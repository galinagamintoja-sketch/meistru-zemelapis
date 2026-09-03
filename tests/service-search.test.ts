import { describe, expect, it } from "vitest";
import { buildServiceSearchOptions, searchServiceOptions } from "../lib/service-search";
import type { Category } from "../lib/types";
import type { Specialist } from "../lib/types";
import { applyFilters } from "../lib/specialists";

const categories: Category[] = [
  { id: "electrical", slug: "elektra-ir-apsauga", name: "Elektra ir apsaugos sistemos", subcategories: [
    { id: "sockets", slug: "rozeciu-ir-jungikliu-montavimas", name: "Rozečių ir jungiklių montavimas" },
    { id: "faults", slug: "gedimu-paieska", name: "Gedimų paieška" }
  ] },
  { id: "plumbing", slug: "santechnika", name: "Santechnika", subcategories: [
    { id: "plumbing-repair", slug: "santechnikos-remontas-ir-smulkus-darbai", name: "Santechnikos remontas ir smulkūs darbai" }
  ] },
  { id: "interior", slug: "vidaus-apdaila", name: "Vidaus apdaila", subcategories: [
    { id: "tiling", slug: "plyteliu-klijavimas", name: "Plytelių klijavimas" }
  ] },
  { id: "roof", slug: "stogai-ir-skardinimas", name: "Stogai ir skardinimas", subcategories: [
    { id: "roof-repair", slug: "stogo-remontas", name: "Stogo remontas" }
  ] }
];

const options = buildServiceSearchOptions(categories);
const firstSlug = (query: string) => searchServiceOptions(options, query)[0]?.slug;

describe("service search", () => {
  it.each([
    ["rozetė", "rozeciu-ir-jungikliu-montavimas"],
    ["rozetes", "rozeciu-ir-jungikliu-montavimas"],
    ["sutaisyti rozetę", "rozeciu-ir-jungikliu-montavimas"],
    ["elektrikas", "elektra-ir-apsauga"],
    ["elektros gedimas", "gedimu-paieska"],
    ["varva kranas", "santechnikos-remontas-ir-smulkus-darbai"],
    ["plytelės", "plyteliu-klijavimas"],
    ["stogo remontas", "stogo-remontas"]
  ])("ranks %s to the expected existing slug", (query, slug) => {
    expect(firstSlug(query)).toBe(slug);
  });

  it("matches partial multi-word Lithuanian text without diacritics", () => {
    expect(firstSlug("plyteli klij")).toBe("plyteliu-klijavimas");
  });

  it("includes existing taxonomy aliases without changing the selected canonical slug", () => {
    expect(firstSlug("jungikliu montavimas")).toBe("rozeciu-ir-jungikliu-montavimas");
  });

  it("returns no suggestions for unrelated text", () => {
    expect(searchServiceOptions(options, "fortepijono derinimas")).toEqual([]);
  });

  it("feeds the selected existing slug into the unchanged specialist filter", () => {
    const base = {
      name: "QA", companyName: null, trade: "", categorySlug: "", categorySlugs: [], subcategorySlugs: [],
      town: "Vilnius", operatingCities: ["Vilnius"], radius: 25, lat: 54.68, lng: 25.27,
      verification: [], verificationLabel: "", rating: 0, reviewCount: 0, color: "#000", phone: "", email: "", whatsapp: "",
      serviceArea: "Vilnius", description: "", photos: [], reviews: [], status: "approved", source: "admin-created"
    } satisfies Omit<Specialist, "id">;
    const electrical = { ...base, id: "electrical", categorySlug: "elektra-ir-apsauga", categorySlugs: ["elektra-ir-apsauga"], subcategorySlugs: ["rozeciu-ir-jungikliu-montavimas"] };
    const plumbing = { ...base, id: "plumbing", categorySlug: "santechnika", categorySlugs: ["santechnika"], subcategorySlugs: ["santechnikos-remontas-ir-smulkus-darbai"] };
    const selectedSlug = firstSlug("rozetes");
    expect(applyFilters([electrical, plumbing], { service: selectedSlug }).map((item) => item.id)).toEqual(["electrical"]);
  });
});

describe("homepage specialist ranking", () => {
  it("orders by rating, then review count, then distance", () => {
    const base = {
      name: "QA", companyName: null, trade: "", categorySlug: "", categorySlugs: [], subcategorySlugs: [],
      town: "Vilnius", operatingCities: ["Vilnius"], radius: 100, lat: 54.68, lng: 25.27,
      verification: [], verificationLabel: "", rating: 4.8, reviewCount: 2, color: "#000", phone: "", email: "", whatsapp: "",
      serviceArea: "Vilnius", description: "", photos: [], reviews: [], status: "approved", source: "admin-created"
    } satisfies Omit<Specialist, "id">;
    const ranked = applyFilters([
      { ...base, id: "lower-rating", rating: 4.7, reviewCount: 100, lat: 54.681 },
      { ...base, id: "fewer-reviews", reviewCount: 1, lat: 54.681 },
      { ...base, id: "farther", reviewCount: 5, lat: 54.75 },
      { ...base, id: "nearer", reviewCount: 5, lat: 54.69 }
    ], { lat: 54.68, lng: 25.27, customerRadiusKm: 50 });

    expect(ranked.map((item) => item.id)).toEqual(["nearer", "farther", "fewer-reviews", "lower-rating"]);
  });
});
