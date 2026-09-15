import { expect, test } from "@playwright/test";

for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 1000 }]) {
  test(`new LocalPro brand and count-free results render on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const logo = page.getByRole("img", { name: "LocalPro.lt" }).first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByText("Specialistai pagal jūsų paiešką")).toHaveCount(2);
    await expect(page.getByText(/^\d+ specialist(?:as|ai|ų) pagal jūsų paiešką$/)).toHaveCount(0);

    await page.getByRole("button", { name: "Žemėlapis" }).click();
    const clusterLabels = await page.locator(".trade-cluster").allTextContents();
    expect(clusterLabels.every((label) => !/^\d+$/.test(label.trim()))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test("shared logo renders on profile, request and admin entry surfaces", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: false, isAdmin: false } }));
  await page.goto("/");
  const profileHref = await page.locator('a[href^="/meistrai/"]').first().getAttribute("href");
  expect(profileHref).toBeTruthy();

  for (const path of [profileHref!, "/request", "/admin"]) {
    await page.goto(path);
    await expect(page.getByRole("img", { name: "LocalPro.lt" }).first()).toBeVisible();
  }
});
