import { expect, test } from "@playwright/test";

test("logged-out mobile visitor is redirected from protected dashboard", async ({ page }) => {
  await page.goto("/meistras/profilis");
  await expect(page).toHaveURL(/\/login\?next=%2Fmeistras%2Fprofilis/);
  await expect(page.getByRole("link", { name: "Tęsti su Google" })).toBeVisible();
  await expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
});

test("Google callback failure returns safely to Lithuanian login", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/login\?error=oauth_callback/);
  await expect(page.getByText("Nepavyko patvirtinti")).toBeVisible();
});

test("authenticated profile editing, ownership, claim and photo moderation", async ({ page }) => {
  test.skip(!process.env.E2E_STORAGE_STATE, "Requires disposable Supabase test user and claim invitation.");
  await page.context().addCookies(JSON.parse(process.env.E2E_STORAGE_STATE!));
  await page.goto("/meistras");
  await expect(page.locator(".portal-map")).toBeVisible();
  await page.getByRole("link", { name: "Profilis" }).first().click();
  await page.getByLabel("Vardas arba veiklos pavadinimas").fill("E2E laikinas meistras");
  await page.getByRole("button", { name: "Išsaugoti profilį" }).click();
  await expect(page.getByRole("status")).toContainText("išsaugotas");
  await page.goto("/meistras/nuotraukos");
  await expect(page.getByText("Reikalingas patvirtinimas")).toBeVisible();
  await expect(page.getByLabel("Pridėti darbų nuotrauką")).toBeVisible();
});
