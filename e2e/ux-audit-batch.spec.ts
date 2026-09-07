import { expect, test } from "@playwright/test";

test("homepage, registration and search return state stay usable across narrow viewports", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  for (const width of [320, 360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    await expect(page.getByRole("banner")).toBeVisible();
  }

  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto("/");
  await page.getByPlaceholder("Kokia paslauga jums reikalinga?").fill("Apdaila");
  await page.getByPlaceholder("Miestas arba vietovė").fill("Vilnius");
  await page.getByRole("button", { name: "Ieškoti" }).click();
  await expect(page).toHaveURL(/service=Apdaila.*locality=Vilnius/);
  const firstProfile = page.locator('a[href^="/meistrai/"]').first();
  await expect(firstProfile).toHaveAttribute("href", /return=/);
  await firstProfile.click();
  const returnLink = page.locator(".public-profile-nav a").last();
  await expect(returnLink).toHaveAttribute("href", /service=Apdaila.*locality=Vilnius.*#results/);
  await returnLink.click();
  await expect(page).toHaveURL(/service=Apdaila.*locality=Vilnius.*#results/, { timeout: 30_000 });

  await page.goto("/meistro-registracija");
  const registrationHeading = page.getByRole("heading", { name: "Meistro registracija", exact: true });
  await expect(registrationHeading).toBeVisible();
  expect((await registrationHeading.boundingBox())?.y).toBeLessThan(844);
  await expect(page.getByRole("heading", { name: /Patikimi meistrai/ })).toHaveCount(0);
});

test("profile gallery is a native modal and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const profileHref = await page.locator('a[href^="/meistrai/"]').first().getAttribute("href");
  await page.goto(profileHref!);
  const opener = page.getByRole("button", { name: /Atidaryti .* darbų galeriją/ });
  test.skip(await opener.count() === 0, "Preview has no profile with an approved photo");
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
