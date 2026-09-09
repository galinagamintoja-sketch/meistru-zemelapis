import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 }
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("offers Google as the only authentication method", async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      expect((await page.goto("/login?next=%2Fmeistras%2Fprofilis"))?.status()).toBe(200);
      const loginGoogle = page.getByRole("link", { name: "Tęsti su Google" });
      await expect(loginGoogle).toBeVisible();
      await expect(loginGoogle).toHaveAttribute("href", "/auth/google?next=%2Fmeistras%2Fprofilis");
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
      await expect(page.getByText("Pamiršau slaptažodį")).toHaveCount(0);
      await expect(page.getByText("arba el. paštu")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      expect((await page.goto("/login?next=https%3A%2F%2Fattacker.example%2Fsteal"))?.status()).toBe(200);
      await expect(page.getByRole("link", { name: "Tęsti su Google" })).toHaveAttribute("href", "/auth/google?next=%2Fmeistras");

      expect((await page.goto("/meistro-registracija"))?.status()).toBe(200);
      await expect(page.getByRole("link", { name: "Tęsti su Google" })).toBeVisible();
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
      await expect(page.getByText("arba el. paštu")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      expect(consoleErrors).toEqual([]);
    });
  });
}
