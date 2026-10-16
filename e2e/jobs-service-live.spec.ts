import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

type Snapshot = { jobs: Array<{ id: string; status: string; expires_at: string; posted_at: string; has_contact_number: boolean }>;
  trades: Array<{ job_id: string; trade_id: string }>; areas: Array<{ job_id: string; area_id: string }>;
  services: Array<{ id: string; service_category_id: string }> };
const additions = [
  { id: "234b903a-1224-4638-95f5-8feca3947894", name: "Dekoratyvinis tinkavimas", category: "23afad17-ae02-48fc-9891-8d0a33fd83d8" },
  { id: "cbad6eaa-4970-4366-a28b-c88d2c312711", name: "Pamatų šiltinimas", category: "f257c155-5c71-403a-aacf-c58cc7e6a0f6" },
  { id: "1fa581c5-e629-4094-a76b-48ef046b303d", name: "Statybinių medžiagų pristatymas ir užnešimas", category: "fd6a7caf-1b6c-478c-b9e3-d1429537ef61" }
];
const construction = "fd6a7caf-1b6c-478c-b9e3-d1429537ef61";
const correct = "0b229d25-2ae1-48e7-b406-2060e730cb9d";
const incorrect = "9b892bc0-d454-44b5-b6a8-d7f17a4a9fc4";

for (const width of [1440, 390]) {
  test.describe(`production services ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, isMobile: width === 390, hasTouch: width === 390 });
    test("real service filters and ICF result match an independent database snapshot", async ({ page, request }) => {
      test.skip(!process.env.LOCALPRO_SERVICE_ORACLE, "Requires an explicitly captured real database snapshot; never substitute fixtures");
      const snapshot: Snapshot = JSON.parse(readFileSync(process.env.LOCALPRO_SERVICE_ORACLE!, "utf8"))[0];
      const eligible = (service: string, area: string, category: string, contact = false, days = 0) => snapshot.jobs.filter((job) => {
        const tags = snapshot.trades.filter((t) => t.job_id === job.id).map((t) => t.trade_id);
        return job.status === "active" && Date.parse(job.expires_at) > Date.now() &&
          (!days || Date.parse(job.posted_at) >= Date.now() - days * 86_400_000) && (!contact || job.has_contact_number) &&
          tags.includes(service) && (!category || tags.some((id) => snapshot.services.some((s) => s.id === id && s.service_category_id === category))) &&
          (!area || snapshot.areas.some((a) => a.job_id === job.id && a.area_id === area));
      }).map((job) => job.id).sort();
      const checkAPI = async (service: string, area: string, category: string, contact = false, days = 0) => {
        const query = new URLSearchParams({ service, area, trade: category, contact_number: String(contact), period: days ? `${days}d` : "all" });
        const response = await request.get(`/api/jobs/feed?${query}`);
        expect(response.status()).toBe(200);
        const body = await response.json();
        const ids = eligible(service, area, category, contact, days);
        expect(ids.length).toBeLessThanOrEqual(6); // this test does not bypass pagination gates
        expect(body.jobs.map((job: { id: string }) => job.id).sort()).toEqual(ids);
        expect(body.taxonomy.services.find((s: { id: string }) => s.id === service).count).toBe(ids.length);
        return ids;
      };
      await page.goto("/darbu-skelbimai");
      const serviceSelect = page.getByRole("combobox", { name: "Paslauga", exact: true });
      const categorySelect = page.getByRole("combobox", { name: "Darbų sritis", exact: true });
      for (const service of additions) {
        await categorySelect.selectOption(service.category);
        await expect(serviceSelect.locator(`option[value="${service.id}"]`)).toContainText(service.name);
        await serviceSelect.selectOption(service.id);
        const ids = await checkAPI(service.id, "", service.category);
        expect(ids).toEqual([]); // held requests have not been imported
        await expect(page.getByRole("heading", { name: "Skelbimų nerasta" })).toBeVisible();
        await expect(serviceSelect).toHaveValue(service.id);
        await expect(serviceSelect.locator(`option[value="${service.id}"]`)).toContainText("(0)");
        await page.reload();
        await expect(serviceSelect).toHaveValue(service.id);
      }
      const query = new URLSearchParams({ service: correct, trade: construction, area: "siauliai" });
      await page.goto(`/darbu-skelbimai?${query}`);
      await expect(serviceSelect).toHaveValue(correct);
      await expect(page.getByRole("combobox", { name: "Miestas ar rajonas", exact: true })).toHaveValue("siauliai");
      await expect(page.getByRole("heading", { name: "Vieno aukšto namo statyba iš ICF blokelių Šiauliuose" })).toBeVisible();
      expect(await checkAPI(correct, "siauliai", construction)).toEqual(["fd693666-0555-4ecb-bd52-d76cc814ea4e"]);
      expect(await checkAPI(incorrect, "siauliai", construction)).toEqual([]);
      await checkAPI(correct, "siauliai", construction, true);
      await checkAPI(correct, "siauliai", construction, false, 1);
      await checkAPI(correct, "siauliai", construction, false, 3);
      await checkAPI(correct, "vilnius", construction);
      await page.getByRole("checkbox").check();
      await expect(page.getByRole("heading", { name: "Skelbimų nerasta" })).toBeVisible();
      await page.getByRole("button", { name: "Išvalyti filtrus" }).click();
      await expect(serviceSelect).toHaveValue("");
      await expect(categorySelect).toHaveValue("");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
