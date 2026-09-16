import { expect, test } from "@playwright/test";

test("preview map, profile links, brand, and profile hero work on mobile", async ({ page }) => {
  await page.goto("/preview/homepage-v2");
  await expect(page.getByRole("link", { name: "LocalPro.lt pagrindinis puslapis" })).toBeVisible();
  await page.getByRole("button", { name: "Žemėlapis" }).click();
  await expect(page.getByLabel("LocalPro specialistų žemėlapis")).toBeVisible();

  await page.getByRole("button", { name: "Sąrašas" }).click();
  const firstProfile = page.locator('a[href^="/meistrai/"]').first();
  await expect(firstProfile).toBeVisible();
  await firstProfile.click();

  await expect(page.getByRole("link", { name: "LocalPro.lt pagrindinis puslapis" })).toBeVisible();
  await expect(page.getByRole("button", { name: /darbų (galeriją|nuotraukos nėra)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Meistrų paieška" })).toHaveAttribute("href", "/preview/homepage-v2#results");
});

test("map pin popup shows the complete specialist hero image", async ({ page }) => {
  await page.goto("/?view=map");
  const map = page.getByLabel("LocalPro specialistų žemėlapis");
  await expect(map).toBeVisible();

  const markers = map.locator("path.leaflet-interactive:not([d='M0 0'])");
  await expect(markers.first()).toBeVisible();
  const markerCount = await markers.count();
  const popupImage = map.locator(".leaflet-popup-content img");
  for (let index = 0; index < markerCount && await popupImage.count() === 0; index += 1) {
    await markers.nth(index).dispatchEvent("click");
  }
  await expect(popupImage).toBeVisible();
  await expect.poll(() => popupImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(popupImage).toHaveCSS("object-fit", "contain");
  const imageBox = await popupImage.boundingBox();
  expect(imageBox?.width).toBeGreaterThanOrEqual(180);
  expect(imageBox?.height).toBeGreaterThanOrEqual(120);
  expect(imageBox?.height).toBeLessThanOrEqual(170);
});
