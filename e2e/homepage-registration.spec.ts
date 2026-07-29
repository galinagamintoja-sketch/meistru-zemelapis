import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 }
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("homepage stays discovery-focused and registration has its own route", async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      await page.goto("/");
      await expect(page.getByRole("link", { name: "Rasti specialistą" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Pateikti darbų užklausą" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Kaip veikia" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Meistro registracija" }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Prisijungti" })).toBeVisible();
      await expect(page.getByRole("form", { name: "LocalPro specialisto registracijos forma" })).toHaveCount(0);
      await expect(page.getByText("Profilio peržiūra")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      await page.getByRole("link", { name: "Meistro registracija" }).first().click();
      await expect(page).toHaveURL(/\/meistro-registracija$/);
      await expect(page.getByRole("heading", { name: "Meistro registracija", level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Tęsti su Google" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Prisijungti el. paštu" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sukurti paskyrą" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Patikimi meistrai jūsų mieste." })).toBeHidden();
      await expect(page.getByText("Profilio peržiūra")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      expect(consoleErrors).toEqual([]);
    });
  });
}
