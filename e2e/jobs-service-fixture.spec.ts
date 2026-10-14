import { test, expect, devices } from "@playwright/test";

const category = "1394b83a-e47c-45f3-8888-a114ef045ab3";
const service = "23afad17-ae02-48fc-9891-8d0a33fd83d8";
const other = "28f109be-eccd-4a6b-b153-b57fbb1bdf00";

// Synthetic browser fixtures, not a claim about production database contents.
for (const mobile of [false, true]) {
  test.describe(mobile ? "service filter mobile fixture" : "service filter desktop fixture", () => {
    test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: devices["iPhone 13"].userAgent } : { viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false });
    test("preserves direct service URLs, refreshes context, clears incompatible service and resets all filters", async ({ page }) => {
      test.skip(process.env.LOCALPRO_FILTER_LIVE === "true", "Local synthetic fixtures only");
      const requests: URL[] = [];
      await page.route("**/api/jobs/feed?**", async (route) => {
        const url = new URL(route.request().url()); requests.push(url);
        const empty = url.searchParams.has("contact_number");
        await route.fulfill({ json: {
          jobs: empty ? [] : [{ id: "fixture", title: "Service fixture", summary: "Synthetic test", source_url: "https://example.com", posted_at: "2026-10-10T12:00:00Z", has_contact_number: false, trades: [], areas: [] }],
          next_cursor: null, has_more: false,
          taxonomy: { trades: [{ id: category, name: "Vidaus apdaila", count: 1 }], areas: [{ id: "kaunas", name: "Kaunas", kind: "city", count: 1 }], services: [
            { id: service, name: "Dekoratyvinis tinkavimas", category_id: category, count: empty ? 0 : 1 },
            { id: other, name: "Pamatų šiltinimas", category_id: "other", count: 0 }
          ] }
        } });
      });
      await page.goto(`/darbu-skelbimai?service=${service}`);
      const services = page.getByRole("combobox", { name: "Paslauga", exact: true });
      await expect(services).toHaveValue(service);
      await expect(services).toContainText("Dekoratyvinis tinkavimas (1)");
      await page.getByRole("combobox", { name: "Miestas ar rajonas", exact: true }).selectOption("kaunas");
      await expect.poll(() => requests.at(-1)?.searchParams.get("area")).toBe("kaunas");
      expect(requests.at(-1)?.searchParams.get("service")).toBe(service);
      expect(requests.at(-1)?.searchParams.has("cursor")).toBe(false);
      await page.getByRole("combobox", { name: "Darbų sritis", exact: true }).selectOption(category);
      await expect(services).toHaveValue("");
      await expect(services.locator("option")).toHaveCount(2);
      await services.selectOption(service);
      await page.getByRole("combobox", { name: "Laikotarpis", exact: true }).selectOption("3d");
      await page.getByRole("checkbox").check();
      await expect(services).toContainText("Dekoratyvinis tinkavimas (0)");
      await expect(services).toHaveValue(service);
      await page.reload();
      await expect(services).toHaveValue(service);
      await expect(page.getByRole("heading", { name: "Skelbimų nerasta" })).toBeVisible();
      await page.getByRole("button", { name: "Išvalyti filtrus" }).click();
      await expect(page).toHaveURL(/\/darbu-skelbimai$/);
      await expect(services).toHaveValue("");
      await expect(page.getByRole("checkbox")).not.toBeChecked();
      await expect(page.getByRole("heading", { name: "Service fixture" })).toBeVisible();
      expect(requests.at(-1)?.searchParams.size).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
