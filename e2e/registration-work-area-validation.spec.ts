import { expect, test } from "@playwright/test";

test("registration focuses work areas before specific services", async ({ page }) => {
  test.skip(!process.env.E2E_STORAGE_STATE, "Requires a disposable Google-authenticated user without a profile.");
  await page.context().addCookies(JSON.parse(process.env.E2E_STORAGE_STATE!));
  await page.goto("/meistro-registracija");

  await page.getByLabel("Vardas arba įmonės pavadinimas *").fill("QA registracijos validacija");
  await page.getByLabel("Telefono numeris *").fill("063601230");
  await page.getByLabel("Viešas kontaktinis el. paštas *").fill("qa-registration@example.invalid");
  await page.getByLabel("Registracijos adresas").fill("Lentvaris");
  await page.getByLabel(/Trumpas aprašymas/).fill("Testinis registracijos aprašymas, turintis daugiau nei aštuoniasdešimt simbolių ir skirtas tik kliento validacijos patikrai.");
  await page.getByLabel(/Sutinku su LocalPro/).check();
  await page.getByLabel(/Sutinku, kad aktyviame profilyje/).check();

  await page.getByRole("button", { name: "Užbaigti registraciją" }).click();
  await expect(page.getByText("Pasirinkite bent vieną darbo sritį.", { exact: true })).toBeVisible();
  await expect(page.locator('[name="workAreas"]').first()).toBeFocused();
  await expect(page.getByText("Pasirinkite bent 2 konkrečias paslaugas.", { exact: true })).toHaveCount(0);

  await page.locator('[name="workAreas"]').first().check();
  await expect(page.getByText("Pasirinkite bent vieną darbo sritį.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Užbaigti registraciją" }).click();
  await expect(page.getByText("Pasirinkite bent 2 konkrečias paslaugas.", { exact: true })).toBeVisible();
  await expect(page.locator('[name="services"]').first()).toBeFocused();
});
