import { expect, test } from "@playwright/test";

const email = process.env.QA_DELETION_EMAIL;
const password = process.env.QA_DELETION_PASSWORD;

test.skip(!email || !password, "Controlled local account credentials are required");

test("owner schedules, is blocked, cancels, and sees a responsive account UI", async ({ page }) => {
  await page.goto("/login?next=%2Fmeistras%2Fpaskyra");
  await page.getByLabel("El. paštas").fill(email!);
  await page.getByLabel("Slaptažodis").fill(password!);
  await page.getByRole("button", { name: "Prisijungti el. paštu" }).click();
  await page.waitForURL(/\/meistras\/paskyra/);

  await expect(page.getByRole("heading", { name: "Visam laikui ištrinti paskyrą" })).toBeVisible();
  await page.getByRole("button", { name: "Ištrinti paskyrą" }).click();
  await page.getByLabel("Prisijungimo el. paštas", { exact: true }).last().fill("wrong@example.lt");
  await page.getByLabel(/Suprantu, kad po 7 dienų/).check();
  await page.getByRole("button", { name: "Patvirtinti paskyros ištrynimą" }).click();
  await expect(page.getByRole("status")).toContainText("nesutampa");

  await page.getByLabel("Prisijungimo el. paštas", { exact: true }).last().fill(email!);
  await page.getByRole("button", { name: "Patvirtinti paskyros ištrynimą" }).click();
  await expect(page.getByText("Jūsų profilis paslėptas.")).toBeVisible();
  await expect(page.getByText(/Paskyra bus visam laikui ištrinta/)).toBeVisible();
  await expect(page.locator("nav").getByRole("link", { name: /Profilis|Paslaugos|Nuotraukos/ })).toHaveCount(0);

  const blocked = await page.request.patch("/api/meistras/visibility", { data: { visible: true }, headers: { origin: new URL(page.url()).origin } });
  expect(blocked.status()).toBe(409);
  await page.goto("/meistras/profilis");
  await expect(page.getByText("Kol ištrynimas neatšauktas")).toBeVisible();

  await page.goto("/meistras/paskyra");
  await page.getByRole("button", { name: "Atšaukti paskyros ištrynimą" }).click();
  await expect(page.getByRole("status")).toContainText("Profilis vėl rodomas viešai");

  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Visam laikui ištrinti paskyrą" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => (entry as PerformanceResourceTiming).responseStatus >= 500).length)).toBe(0);
});
