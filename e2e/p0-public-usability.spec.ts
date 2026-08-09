import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 }
]) {
  test(`${viewport.name}: public and legal pages are usable`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    for (const route of ["/", "/privacy", "/terms", "/login"]) {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${route} should load`).toBe(200);
      await expect(page.locator("body")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} should not overflow horizontally`).toBeLessThanOrEqual(1);
    }

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privatumo politika" })).toBeVisible();
    await expect(page.getByText("0,5–1 km")).toBeVisible();
    await expect(page.getByText("Valstybinei duomenų apsaugos inspekcijai")).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Naudojimosi sąlygos" })).toBeVisible();
    await expect(page.getByText("LocalPro nėra statybos darbų rangovas", { exact: false })).toBeVisible();
    expect(consoleErrors).toEqual([]);
    await context.close();
  });
}
