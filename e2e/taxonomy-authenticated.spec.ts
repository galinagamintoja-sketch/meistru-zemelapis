import { expect, test } from "@playwright/test";

const email = process.env.TAXONOMY_QA_EMAIL;
const registrationEmail = process.env.TAXONOMY_REGISTRATION_QA_EMAIL;
const password = process.env.TAXONOMY_QA_PASSWORD;
const expectedCategories = Number(process.env.TAXONOMY_QA_CATEGORY_COUNT ?? 0);
const protectionBypass = process.env.VERCEL_PROTECTION_BYPASS;

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 }
]) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      extraHTTPHeaders: protectionBypass
        ? { "x-vercel-protection-bypass": protectionBypass }
        : undefined
    });

    test("registration and authenticated dashboard preserve explicit taxonomy selections", async ({ page, browser }) => {
      test.skip(!email || !registrationEmail || !password || !expectedCategories, "Requires disposable taxonomy browser fixture.");
      const errors: string[] = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.route("**/api/auth/email", (route) => route.continue({
        headers: { ...route.request().headers(), origin: new URL(route.request().url()).origin }
      }));
      await page.goto("/login?next=%2Fmeistras%2Fpaslaugos");
      await page.getByLabel("El. paštas").fill(email!);
      await page.getByLabel("Slaptažodis").fill(password!);
      await Promise.all([
        page.waitForURL(/\/meistras\/paslaugos/),
        page.getByRole("button", { name: "Prisijungti el. paštu" }).click()
      ]);
      await expect(page.getByText(`Darbo sritys: pasirinkta ${expectedCategories} iš 8 · liko ${8 - expectedCategories}`)).toBeVisible();
      await expect(page.getByText("Paslaugos: pasirinkta 25 iš 25 · liko 0")).toBeVisible();
      await expect(page.locator(".selected-service-tags button")).toHaveCount(25);
      await expect(page.getByLabel("Vidaus durų montavimas", { exact: true })).toHaveCount(2);
      expect(await page.getByLabel("Vidaus durų montavimas", { exact: true }).evaluateAll((items) =>
        items.every((item) => (item as HTMLInputElement).checked)
      )).toBe(true);
      await expect(page.locator(".selected-service-tags button", { hasText: "Vidaus durų montavimas" })).toHaveCount(1);
      expect(await page.locator(".portal-checks > label > input[type=checkbox]:checked").first().isVisible()).toBe(true);
      const selectedWorkAreas = await page.locator(".services-editor > section:first-child > .portal-checks input:checked").evaluateAll((items) => items.map((item) => (item.parentElement?.textContent ?? "").trim()));

      await page.locator(".selected-service-tags button").first().click();
      const availableGroup = page.locator(".service-accordions details").filter({
        has: page.locator("input[type=checkbox]:not(:checked):not(:disabled)")
      }).first();
      await availableGroup.locator("summary").click();
      const replacement = availableGroup.locator("input[type=checkbox]:not(:checked):not(:disabled)").first();
      await replacement.check();
      const saveResponse = page.waitForResponse((response) => response.url().includes("/api/meistras/services") && response.request().method() === "PUT");
      await page.getByRole("button", { name: "Išsaugoti paslaugas" }).click();
      expect((await saveResponse).status()).toBe(200);
      await page.reload();
      await expect(page.getByText("Paslaugos: pasirinkta 25 iš 25 · liko 0")).toBeVisible();
      const reopenedWorkAreas = await page.locator(".services-editor > section:first-child > .portal-checks input:checked").evaluateAll((items) => items.map((item) => (item.parentElement?.textContent ?? "").trim()));
      expect(reopenedWorkAreas).toEqual(selectedWorkAreas);
      if (viewport.name === "mobile") await page.screenshot({ path: "artifacts/taxonomy-mobile-dashboard.png", fullPage: true });

      const anonymous = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        extraHTTPHeaders: protectionBypass
          ? { "x-vercel-protection-bypass": protectionBypass }
          : undefined
      });
      const registration = await anonymous.newPage();
      await registration.route("**/api/auth/email", (route) => route.continue({
        headers: { ...route.request().headers(), origin: new URL(route.request().url()).origin }
      }));
      await registration.goto("/meistro-registracija");
      await registration.getByLabel("El. paštas").fill(registrationEmail!);
      await registration.getByLabel("Slaptažodis").fill(password!);
      await registration.getByRole("button", { name: "Prisijungti el. paštu" }).click();
      await expect(registration.getByText("Darbo sritys: pasirinkta 0 iš 8 · liko 8")).toBeVisible();
      await expect(registration.getByText("Paslaugos: pasirinkta 0 iš 25 · liko 25")).toBeVisible();
      const workAreaChecks = registration.locator("fieldset").filter({ hasText: "Darbo sritys:" }).locator("input[type=checkbox]");
      for (let index = 0; index < Math.min(8, await workAreaChecks.count()); index += 1) await workAreaChecks.nth(index).check();
      const serviceChecks = registration.locator("fieldset").filter({ hasText: "Paslaugos:" }).locator("input[type=checkbox]");
      for (let index = 0; index < 25; index += 1) await serviceChecks.nth(index).check();
      await expect(registration.getByText("Paslaugos: pasirinkta 25 iš 25 · liko 0")).toBeVisible();
      expect(await serviceChecks.nth(25).isDisabled()).toBe(true);
      if (viewport.name === "mobile") await registration.screenshot({ path: "artifacts/taxonomy-mobile-registration.png", fullPage: true });
      await anonymous.close();
      expect(errors).toEqual([]);
    });
  });
}
