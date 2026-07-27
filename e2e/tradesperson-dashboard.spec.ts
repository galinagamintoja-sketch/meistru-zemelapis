import { expect, test } from "@playwright/test";

test("logged-out mobile visitor is redirected from protected dashboard", async ({ page }) => {
  await page.goto("/meistras/profilis");
  await expect(page).toHaveURL(/\/login\?next=%2Fmeistras%2Fprofilis/);
  await expect(page.getByRole("link", { name: "Tęsti su Google" })).toBeVisible();
  await expect(page.getByText("Po pirmo prisijungimo užpildysite trumpą registraciją")).toBeVisible();
  await expect(page.getByRole("button", { name: "Prisijungti el. paštu" })).toBeVisible();
  await expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
});

test("Google callback failure returns safely to Lithuanian login", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/login\?error=oauth_callback/);
  await expect(page.getByText("Nepavyko patvirtinti")).toBeVisible();
});

test("authenticated profile editing, ownership and photo moderation", async ({ page }) => {
  test.skip(!process.env.E2E_STORAGE_STATE, "Requires a disposable Supabase user with an automatically linked onboarding profile.");
  await page.context().addCookies(JSON.parse(process.env.E2E_STORAGE_STATE!));
  await page.goto("/meistras");
  await expect(page).toHaveURL(/\/meistras\/uzklausos/);
  await expect(page.getByRole("heading", { name: "Užklausos" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Naujos/ })).toBeVisible();
  await page.getByRole("link", { name: "Profilis" }).first().click();
  await page.getByLabel("Vardas ir pavardė").fill("E2E pakeistas meistras");
  const profileResponse = page.waitForResponse((response) => response.url().includes("/api/meistras/profile"));
  await page.getByRole("button", { name: "Išsaugoti profilį" }).click();
  expect((await profileResponse).status()).toBe(200);
  await expect(page.getByRole("status")).toContainText("išsaugotas");
  await page.goto("/meistras/nuotraukos");
  await expect(page.getByText("Pasirinkti nuotraukas", { exact: true })).toBeVisible();

  if (process.env.E2E_SERVICE_ID && process.env.E2E_ENQUIRY_ID && process.env.E2E_FORBIDDEN_ENQUIRY_ID) {
    const services = await page.request.put("/api/meistras/services", { data: { subcategoryIds: [process.env.E2E_SERVICE_ID] } });
    expect(services.status()).toBe(200);
    const location = await page.request.put("/api/meistras/areas", { data: {
      baseCity: "Vilnius", registeredAddress: "Privatus g. 1, Vilnius", googlePlaceId: "preview-e2e",
      latitude: 54.6872, longitude: 25.2797, radiusKm: 30
    } });
    expect(location.status()).toBe(200);

    const before = await page.request.get(`/api/meistras/requests/${process.env.E2E_ENQUIRY_ID}`);
    expect(before.status()).toBe(200);
    expect((await before.json()).request.contact).toBeNull();
    const interested = await page.request.patch(`/api/meistras/requests/${process.env.E2E_ENQUIRY_ID}`, { data: { action: "interested" } });
    expect(interested.status()).toBe(200);
    const after = await page.request.get(`/api/meistras/requests/${process.env.E2E_ENQUIRY_ID}`);
    expect((await after.json()).request.contact.phone).toBe("+37060005555");
    const forbidden = await page.request.get(`/api/meistras/requests/${process.env.E2E_FORBIDDEN_ENQUIRY_ID}`);
    expect(forbidden.status()).toBe(404);
  }

  if (process.env.ADMIN_EMAIL_ALLOWLIST) {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Profilių patikros skydelis" })).toBeVisible();
    if (process.env.E2E_PROFILE_ID && process.env.E2E_PENDING_PHOTO_ID) {
      const moderation = await page.request.patch("/api/admin/profiles", { data: {
        id: process.env.E2E_PROFILE_ID, action: "moderate_photo",
        photoId: process.env.E2E_PENDING_PHOTO_ID, moderationStatus: "approved"
      } });
      expect(moderation.status()).toBe(200);
    }
  }
});
