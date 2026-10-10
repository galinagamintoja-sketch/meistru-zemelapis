import { test, expect, devices } from "@playwright/test";

// Synthetic fixtures isolate browser update/race behaviour; not production data.
for (const mobile of [false, true]) {
  test.describe(mobile ? "mobile fixture" : "desktop fixture", () => {
    test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: devices["iPhone 13"].userAgent } : { viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false });
    test("refreshes facets, retains zero options, and rejects stale responses", async ({ page }) => {
      test.skip(process.env.LOCALPRO_FILTER_LIVE === "true", "Local synthetic fixtures only");
      let release: (() => void) | undefined;
      let holdKaunas = false;
      const pending = new Promise<void>((resolve) => { release = resolve; });
      const requests: string[] = [];
      await page.route("**/api/jobs/feed?**", async (route) => {
        const url = new URL(route.request().url()); requests.push(url.search);
        const area = url.searchParams.get("area") ?? "";
        if (holdKaunas && area === "kaunas") await pending;
        const count = area === "kaunas" ? 2 : area === "vilnius" ? 5 : 7;
        const empty = url.searchParams.get("contact_number") === "true";
        await route.fulfill({ json: { jobs: empty ? [] : [{ id: area || "all", title: `Fixture ${area || "all"}`, summary: "Test only", source_url: "https://example.com", posted_at: "2026-10-10T12:00:00Z", has_contact_number: false, trades: [], areas: [{ id: area, name: area, kind: "city" }] }],
          next_cursor: null, has_more: false, taxonomy: { trades: [{ id: "category", name: "Vidaus apdaila", count: empty ? 0 : count }], areas: [{ id: "kaunas", name: "Kaunas", kind: "city", count: 2 }, { id: "vilnius", name: "Vilnius", kind: "city", count: 5 }] } } });
      });
      await page.goto("/darbu-skelbimai");
      const area = page.getByRole("combobox", { name: "Miestas ar rajonas", exact: true });
      const trade = page.getByRole("combobox", { name: "Darbų sritis", exact: true });
      await expect(trade).toContainText("Vidaus apdaila (7)");
      await area.selectOption("kaunas"); await expect(trade).toContainText("Vidaus apdaila (2)");
      await trade.selectOption("category"); await expect(page.getByRole("heading", { name: "Fixture kaunas" })).toBeVisible();
      await page.getByRole("combobox", { name: "Laikotarpis", exact: true }).selectOption("3d");
      await page.getByRole("checkbox").check(); await expect(trade).toContainText("Vidaus apdaila (0)");
      await expect(page.getByRole("heading", { name: "Skelbimų nerasta" })).toBeVisible();
      expect(requests.at(-1)).toContain("trade=category"); expect(requests.at(-1)).toContain("period=3d"); expect(requests.at(-1)).toContain("contact_number=true");
      await page.getByRole("checkbox").uncheck(); await expect(trade).toContainText("Vidaus apdaila (2)");
      holdKaunas = true;
      await area.selectOption("vilnius"); await expect(trade).toContainText("Vidaus apdaila (5)");
      await area.selectOption("kaunas"); await expect(trade).toContainText("Vidaus apdaila (…)");
      await area.selectOption("vilnius"); await expect(trade).toContainText("Vidaus apdaila (5)");
      release!();
      await expect(page.getByRole("heading", { name: "Fixture vilnius" })).toBeVisible();
      await expect(trade).toHaveValue("category"); await expect(area).toHaveValue("vilnius");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
