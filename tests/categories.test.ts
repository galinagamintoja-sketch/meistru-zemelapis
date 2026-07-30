import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.fn();
const query = {
  select,
  eq: vi.fn(() => query),
  order: vi.fn(async () => ({
    data: [{
      id: "category-remontas",
      name: "Remontas",
      slug: "remontas",
      service_category_assignments: [
        { service_subcategories: { id: "active-service", name: "Aktyvi paslauga", slug: "aktyvi-paslauga", is_active: true } },
        { service_subcategories: { id: "inactive-service", name: "Neaktyvi paslauga", slug: "neaktyvi-paslauga", is_active: false } }
      ]
    }],
    error: null
  }))
};

vi.mock("../lib/supabase", () => ({
  createServerSupabase: () => ({ from: vi.fn(() => query) })
}));

describe("hosted category taxonomy", () => {
  beforeEach(() => {
    select.mockImplementation(() => query);
  });

  it("uses canonical category assignments and returns active services only", async () => {
    const { getCategories } = await import("../lib/specialists");
    const categories = await getCategories();

    expect(select).toHaveBeenCalledWith(expect.stringContaining(
      "service_category_assignments(service_subcategories"
    ));
    expect(categories).toEqual([{
      id: "category-remontas",
      name: "Remontas",
      slug: "remontas",
      subcategories: [{ id: "active-service", name: "Aktyvi paslauga", slug: "aktyvi-paslauga" }]
    }]);
  });
});
