import { describe, expect, it, vi } from "vitest";
import { legacyProfileSeoSlug, profileSeoSlug } from "../lib/seo";
import { resolveServicesCategoryIds } from "../lib/services-category-resolution";
import { saveServicesAndArea } from "../lib/services-save";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ServicesForm } from "../components/tradesperson-forms";
import type { Specialist } from "../lib/types";

describe("PR 31 follow-up regressions", () => {
  it("keeps the pre-normalization profile slug as a resolvable alias", () => {
    const normalized = { id: "profile-1", name: "Linas R.", companyName: null, categorySlug: "apdaila", trade: "Vidaus apdaila", town: "Lentvaris" } as Specialist;
    expect(legacyProfileSeoSlug(normalized)).not.toBe(profileSeoSlug(normalized));
    expect(legacyProfileSeoSlug(normalized)).toContain("vidaus-apdaila");
  });

  it("derives active work areas from normalized services when assignments are retired", () => {
    expect(resolveServicesCategoryIds({
      activeCategoryIds: ["electrical"],
      assignedCategoryIds: ["retired-electrical"],
      serviceCategoryIds: ["electrical", "electrical"],
      legacyCategoryId: "retired-electrical"
    })).toEqual({ selectedCategoryIds: ["electrical"], unresolved: false });
  });

  it("preserves valid assignments and reports ambiguous legacy replacements", () => {
    expect(resolveServicesCategoryIds({
      activeCategoryIds: ["electrical", "plumbing"],
      assignedCategoryIds: ["electrical"],
      serviceCategoryIds: ["plumbing"],
      legacyCategoryId: "retired"
    })).toEqual({ selectedCategoryIds: ["electrical"], unresolved: false });
    expect(resolveServicesCategoryIds({
      activeCategoryIds: ["electrical", "plumbing"],
      assignedCategoryIds: ["retired"],
      serviceCategoryIds: ["electrical", "plumbing"],
      legacyCategoryId: "retired"
    })).toEqual({ selectedCategoryIds: [], unresolved: true });
  });

  it("preserves an active stored primary category before considering saved services", () => {
    expect(resolveServicesCategoryIds({
      activeCategoryIds: ["electrical", "plumbing"],
      assignedCategoryIds: [],
      serviceCategoryIds: ["plumbing", "electrical"],
      legacyCategoryId: "electrical"
    })).toEqual({ selectedCategoryIds: ["electrical"], unresolved: false });
  });

  it("does not let a retired stored primary category override one service-derived category", () => {
    expect(resolveServicesCategoryIds({
      activeCategoryIds: ["electrical"],
      assignedCategoryIds: [],
      serviceCategoryIds: ["electrical", "electrical"],
      legacyCategoryId: "retired"
    })).toEqual({ selectedCategoryIds: ["electrical"], unresolved: false });
  });

  it("does not send either request when no valid work area is selected", async () => {
    const fetcher = vi.fn();
    await expect(saveServicesAndArea(fetcher, {
      categoryIds: [], subcategoryIds: [], area: { baseCity: "Vilnius", registeredAddress: "", googlePlaceId: "", latitude: null, longitude: null, radiusKm: 20 }
    })).resolves.toEqual({ ok: false, error: "Pasirinkite bent vieną darbo sritį prieš išsaugodami." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("renders the actionable warning and disables Save until a work area is selected", () => {
    const common = {
      groups: [{ id: "electrical", name: "Elektra", items: [] }],
      selected: [],
      location: { baseCity: "Vilnius", radiusKm: 20, address: "", placeId: "", latitude: null, longitude: null, town: "Vilnius" }
    };
    const blocked = renderToStaticMarkup(createElement(ServicesForm, { ...common, selectedCategories: [] }));
    expect(blocked).toContain("Pasirinkite tinkamą darbo sritį prieš išsaugodami");
    expect(blocked).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    const valid = renderToStaticMarkup(createElement(ServicesForm, { ...common, selectedCategories: ["electrical"] }));
    expect(valid).not.toContain("Pasirinkite tinkamą darbo sritį prieš išsaugodami");
    expect(valid).not.toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  it("sends both validated updates once a work area is selected", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    await expect(saveServicesAndArea(fetcher, {
      categoryIds: ["electrical"], subcategoryIds: [], area: { baseCity: "Vilnius", registeredAddress: "", googlePlaceId: "", latitude: null, longitude: null, radiusKm: 20 }
    })).resolves.toEqual({ ok: true, message: "Paslaugos ir darbo zona išsaugotos." });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/meistras/services", "/api/meistras/areas"]);
  });
});
