import { describe, expect, it } from "vitest";
import { defaultTradePhoto } from "../lib/default-trade-photo";

describe("defaultTradePhoto", () => {
  it("uses the category-specific photo and resolves legacy category slugs", () => {
    expect(defaultTradePhoto("santechnika")).toBe("/trade-defaults/santechnika.webp");
    expect(defaultTradePhoto("elektra")).toBe("/trade-defaults/elektra-ir-apsauga.webp");
  });

  it("uses a generic photo if a category is unknown", () => {
    expect(defaultTradePhoto("unknown")).toBe("/trade-defaults/meistras-i-namus.webp");
  });
});
