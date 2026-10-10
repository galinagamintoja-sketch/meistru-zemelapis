import { test, expect, devices } from "@playwright/test";

type Taxonomy = { trades: { id: string; name: string; count: number }[]; areas: { id: string; name: string; count: number }[] };
type Feed = { taxonomy: Taxonomy; jobs: { id: string; title: string; has_contact_number: boolean; posted_at: string; areas: { id: string }[] }[]; has_more: boolean };
const live = process.env.LOCALPRO_FILTER_LIVE === "true";

for (const mobile of [false, true]) {
  test.describe(mobile ? "mobile" : "desktop", () => {
    test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: devices["iPhone 13"].userAgent } : { viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false });
    test("city/category/date/phone counts and listings update together", async ({ page, request }, testInfo) => {
      test.skip(!live, "Requires explicit live verification mode");
      test.setTimeout(180000);
      const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/darbu-skelbimai");
      const trade = page.getByRole("combobox", { name: "Darbų sritis", exact: true });
      const area = page.getByRole("combobox", { name: "Miestas ar rajonas", exact: true });
      const period = page.getByRole("combobox", { name: "Laikotarpis", exact: true });
      const phone = page.getByRole("checkbox", { name: "Tik skelbimai su telefono numeriu" });
      async function change(action: () => Promise<unknown>) {
        const response = page.waitForResponse((r) => r.url().includes("/api/jobs/feed?") && r.status() === 200);
        await action(); const feed = await (await response).json() as Feed;
        for (const item of feed.taxonomy.trades) await expect(trade.locator(`option[value="${item.id}"]`)).toHaveText(`${item.name} (${item.count})`);
        await expect(page.locator("article")).toHaveCount(feed.jobs.length);
        for (const job of feed.jobs) await expect(page.getByRole("heading", { name: job.title, exact: true })).toBeVisible();
        return feed;
      }
      const nation = await (await request.get("/api/jobs/feed")).json() as Feed;
      const kaunas = await change(() => area.selectOption("kaunas"));
      expect(kaunas.jobs.every((job) => job.areas.some((a) => a.id === "kaunas"))).toBe(true);
      const interior = kaunas.taxonomy.trades.find((t) => t.name === "Vidaus apdaila")!;
      expect(interior.count).toBeLessThan(nation.taxonomy.trades.find((t) => t.id === interior.id)!.count);
      const selected = await change(() => trade.selectOption(interior.id));
      expect(selected.jobs.length).toBe(Math.min(6, interior.count));
      await change(() => period.selectOption("7d"));
      const contact = await change(() => phone.check());
      expect(contact.jobs.every((job) => job.has_contact_number)).toBe(true);
      const vilnius = await change(() => area.selectOption("vilnius"));
      expect(vilnius.jobs.every((job) => job.areas.some((a) => a.id === "vilnius"))).toBe(true);
      // Reload/deep-link preserves all four filters and server-rendered counts.
      const url = page.url(); await page.reload();
      await expect(area).toHaveValue("vilnius"); await expect(trade).toHaveValue(interior.id);
      await expect(period).toHaveValue("7d"); await expect(phone).toBeChecked();
      await expect(page.locator("article")).toHaveCount(vilnius.jobs.length);
      expect(page.url()).toBe(url);
      await change(() => phone.uncheck()); await change(() => period.selectOption("all"));
      await change(() => trade.selectOption(""));
      await change(() => area.selectOption("kauno-rajonas"));
      await change(() => area.selectOption(""));
      // Trigger overlapping city requests; the latest selection must win.
      await area.selectOption("kaunas"); await area.selectOption("vilnius");
      await expect(area).toHaveValue("vilnius");
      const expected = await (await request.get("/api/jobs/feed?area=vilnius")).json() as Feed;
      for (const item of expected.taxonomy.trades) await expect(trade.locator(`option[value="${item.id}"]`)).toHaveText(`${item.name} (${item.count})`);
      await expect(page.locator("article")).toHaveCount(expected.jobs.length);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${mobile ? "mobile" : "desktop"}-vilnius.png`), fullPage: true });
      console.log(JSON.stringify({ viewport: mobile ? "mobile" : "desktop", interiorCounts: { nationwide: nation.taxonomy.trades.find((t) => t.id === interior.id)!.count, kaunas: interior.count, vilnius: expected.taxonomy.trades.find((t) => t.id === interior.id)!.count } }));
    });
  });
}

test("live all categories agree with listing results across city/date/phone combinations", async ({ request }) => {
  test.skip(!live, "Requires explicit live verification mode"); test.setTimeout(240000);
  let checks = 0;
  for (const area of ["", "kaunas", "vilnius", "kauno-rajonas"]) {
    for (const period of ["all", "1d", "3d", "7d"]) {
      for (const contact of [false, true]) {
        const params = new URLSearchParams({ area, period, contact_number: String(contact) });
        const response = await request.get(`/api/jobs/feed?${params}`); expect(response.status()).toBe(200);
        const base = await response.json() as Feed;
        await Promise.all(base.taxonomy.trades.map(async (category) => {
          const query = new URLSearchParams(params); query.set("trade", category.id);
          const reply = await request.get(`/api/jobs/feed?${query}`); expect(reply.status()).toBe(200);
          const feed = await reply.json() as Feed;
          expect(feed.jobs.length, `${area}/${period}/${contact}/${category.name}`).toBe(Math.min(6, category.count));
          expect(feed.has_more).toBe(category.count > 6);
          expect(feed.taxonomy.trades).toEqual(base.taxonomy.trades);
          for (const job of feed.jobs) {
            if (area) expect(job.areas.some((a) => a.id === area)).toBe(true);
            if (contact) expect(job.has_contact_number).toBe(true);
            if (period !== "all") expect(Date.parse(job.posted_at)).toBeGreaterThan(Date.now() - Number(period[0]) * 86400000 - 10000);
          }
          checks++;
        }));
      }
    }
  }
  console.log(`Verified ${checks} live category/city/date/phone combinations`);
});
