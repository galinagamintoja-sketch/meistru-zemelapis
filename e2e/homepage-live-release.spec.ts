import { expect, test } from "@playwright/test";

test("the live root renders homepage v2 and legal links", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Patikimi meistrai/i })).toBeVisible();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.getByRole("link", { name: "Privatumo politika" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Naudojimosi sąlygos" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "Pagalba" })).toHaveAttribute("href", "mailto:pagalba@localpro.lt");
});

test("a listed profile opens and returns to root results", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("#results").getByRole("link").filter({ has: page.locator("h3") }).first();
  test.skip(await card.count() === 0, "Preview has no public specialists configured");
  await card.click();
  await expect(page).toHaveURL(/\/meistrai\//);
  await expect(page.getByRole("link", { name: /Meistrų paieška/i })).toHaveAttribute("href", "/#results");
});

test("the live root remains usable at desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Patikimi meistrai/i })).toBeVisible();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 1440);
});

test("the map cannot zoom out beyond Lithuania", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Žemėlapis/i }).click();
  const map = page.getByLabel("LocalPro specialistų žemėlapis");
  await expect(map).toBeVisible();
  const zoomOut = map.locator(".leaflet-control-zoom-out");
  for (let index = 0; index < 12; index += 1) await zoomOut.click({ force: true });
  await expect(zoomOut).toHaveClass(/leaflet-disabled/);
});
