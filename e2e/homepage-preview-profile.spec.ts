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
