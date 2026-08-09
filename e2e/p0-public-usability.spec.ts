import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 }
]) {
  test(`${viewport.name}: public and legal pages are usable`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    await page.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: null, isAdmin: false }) }));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    for (const route of ["/", "/privacy", "/terms"]) {
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

  test(`${viewport.name}: a visitor can report a public profile`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    await page.route("**/api/profile-reports", async (route) => {
      const payload = route.request().postDataJSON();
      expect(payload.reason).toBe("wrong_contact");
      expect(payload.details).toContain("telefono numeris");
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ accepted: true }) });
    });

    await page.goto("/specialist/jonas");
    await page.getByRole("button", { name: "Pranešti apie profilį" }).click();
    await page.getByLabel("Problema").selectOption("wrong_contact");
    await page.getByLabel("Trumpai paaiškinkite").fill("Nurodytas telefono numeris yra neteisingas.");
    await page.getByRole("button", { name: "Siųsti pranešimą" }).click();
    await expect(page.getByText("Ačiū. Pranešimas perduotas LocalPro administratoriui.")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await context.close();
  });
}
