import { test, expect } from "@playwright/test";
const id = "23afad17-ae02-48fc-9891-8d0a33fd83d8";

test("uppercase category deep links match lowercase counts and listings", async ({ page, request }) => {
  test.skip(process.env.LOCALPRO_FILTER_LIVE !== "true", "Explicit live verification only");
  const lower = await (await request.get(`/api/jobs/feed?trade=${id}&area=kaunas`)).json();
  const upper = await (await request.get(`/api/jobs/feed?trade=${id.toUpperCase()}&area=kaunas`)).json();
  expect(upper.jobs.map((j: { id: string }) => j.id)).toEqual(lower.jobs.map((j: { id: string }) => j.id));
  expect(upper.taxonomy).toEqual(lower.taxonomy);
  await page.goto(`/darbu-skelbimai?trade=${id.toUpperCase()}&area=kaunas`);
  await expect(page.getByRole("combobox", { name: "Darbų sritis", exact: true })).toHaveValue(id);
  await expect(page.locator("article h2")).toHaveText(lower.jobs.map((j: { title: string }) => j.title));
});

test("recovers counts when SSR jobs succeeded but taxonomy failed (injected failure)", async ({ page }) => {
  test.skip(process.env.LOCALPRO_FILTER_LIVE !== "true", "Explicit live verification only");
  // Alter only this browser's document response, never server state or real data.
  await page.route("**/darbu-skelbimai?area=kaunas", async (route) => {
    const response = await route.fetch();
    let html = await response.text();
    const pattern = /\\"initialTaxonomy\\":\{[\s\S]*?\},\\"initialAccess\\":/;
    expect(html).toMatch(pattern);
    html = html.replace(pattern, '\\"initialTaxonomy\\":null,\\"initialAccess\\":');
    let index = 0;
    html = html.replace(/(<select[^>]*>)[\s\S]*?(<\/select>)/g, (match, start, end) => {
      index++;
      return index <= 2 ? `${start}<option value="">${index === 1 ? "Visos sritys" : "Visos vietovės"}</option>${end}` : match;
    });
    await route.fulfill({ response, body: html });
  });
  const recovery = page.waitForResponse((r) => r.url().includes("/api/jobs/feed?area=kaunas") && r.status() === 200);
  await page.goto("/darbu-skelbimai?area=kaunas");
  const feed = await (await recovery).json();
  await expect(page.getByRole("combobox", { name: "Darbų sritis", exact: true }).locator(`option[value="${id}"]`)).toHaveText(`Vidaus apdaila (${feed.taxonomy.trades.find((t: { id: string }) => t.id === id).count})`);
  await expect(page.getByRole("combobox", { name: "Miestas ar rajonas", exact: true })).toHaveValue("kaunas");
  await expect(page.locator("article h2")).toHaveText(feed.jobs.map((j: { title: string }) => j.title));
});
