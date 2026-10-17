import { expect, test, type Page } from "@playwright/test";

// Read-only: no fixture accounts, uploads or production data changes.
// Run against staging or production with PLAYWRIGHT_BASE_URL.
test.skip(!process.env.PLAYWRIGHT_BASE_URL, "Requires a deployed profile with portfolio photos.");
const profile = process.env.GALLERY_PROFILE_PATH ?? "/meistrai/lukmila-dazytojas-kaunas-073pa1m";

async function assertPhotoFits(page: Page) {
  const image = page.locator(".profile-lightbox img");
  await expect.poll(() => image.evaluate((node) => {
    const img = node as HTMLImageElement;
    const r = img.getBoundingClientRect();
    return img.complete && img.naturalWidth > 0 && r.width > 100 && r.height > 100;
  })).toBe(true);
  const layout = await image.evaluate((node) => {
    const img = node as HTMLImageElement;
    const r = img.getBoundingClientRect();
    const dialog = img.closest("dialog")!;
    const viewport = window.visualViewport;
    const width = viewport?.width ?? innerWidth;
    const height = viewport?.height ?? innerHeight;
    const controls = [...dialog.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
    return {
      fit: getComputedStyle(img).objectFit,
      inside: r.left >= 0 && r.top >= 0 && r.right <= width + 1 && r.bottom <= height + 1,
      controlsInside: controls.every((b) => b.left >= 0 && b.top >= 0 && b.right <= width + 1 && b.bottom <= height + 1),
      overflow: dialog.scrollWidth > dialog.clientWidth || document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
  expect(layout).toEqual({ fit: "contain", inside: true, controlsInside: true, overflow: false });
}

async function swipe(page: Page, direction: "left" | "right", native: boolean) {
  const stage = page.locator(".profile-lightbox-stage");
  const box = (await stage.boundingBox())!;
  const startX = box.x + box.width * (direction === "left" ? 0.8 : 0.2);
  const endX = box.x + box.width * (direction === "left" ? 0.2 : 0.8);
  const y = box.y + box.height / 2;
  if (native) {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
    for (let i = 1; i <= 5; i++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX + (endX - startX) * i / 5, y }] });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
  } else {
    // WebKit Playwright has no native drag-touch API. Exercise pointer handlers
    // in that engine; Android coverage above uses actual browser touch input.
    await stage.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: startX, clientY: y });
    await stage.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: endX, clientY: y });
  }
}

test("every enlarged photo is visible, contained and navigable", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Gallery regression tests use an explicit rejected analytics preference; the
  // initial choice/persistence/revocation UI is exercised by analytics-ui-live.
  await page.addInitScript(() => localStorage.setItem("localpro.analytics-consent.v1", "rejected"));
  await page.goto(profile);
  const thumbnails = page.locator(".public-profile-gallery-button");
  const count = await thumbnails.count();
  expect(count).toBeGreaterThan(1);
  await expect(page.locator("[data-gallery-ready=true]")).toBeVisible();
  const thumbnailAlts = await thumbnails.locator("img").evaluateAll((images) => images.map((image) => image.getAttribute("alt")));
  expect(thumbnailAlts).toHaveLength(count);
  expect(thumbnailAlts.every((alt) => Boolean(alt?.trim()))).toBe(true);
  await expect(page.locator(".public-profile-hero-photo img")).toHaveAttribute("alt", thumbnailAlts[0]!);
  const opener = thumbnails.nth(count - 2);
  await opener.click();
  const dialog = page.getByRole("dialog");
  const counter = dialog.locator(".profile-lightbox-controls span");
  await expect(counter).toHaveText(`${count - 1} / ${count}`);
  for (let i = 0; i < count; i++) {
    await assertPhotoFits(page);
    // Labelled and unlabelled photos must retain their alt as the viewer moves.
    await expect(dialog.locator("img")).toHaveAttribute("alt", thumbnailAlts[(count - 2 + i) % count]!);
    await dialog.getByRole("button", { name: "Kita nuotrauka" }).click();
  }
  await expect(counter).toHaveText(`${count - 1} / ${count}`);
  await dialog.getByRole("button", { name: "Ankstesnė nuotrauka" }).click();
  await expect(counter).toHaveText(`${count - 2} / ${count}`);
  await page.keyboard.press("ArrowRight");
  await expect(counter).toHaveText(`${count - 1} / ${count}`);
  await swipe(page, "left", testInfo.project.name === "android-chrome");
  await expect(counter).toHaveText(`${count} / ${count}`);
  await swipe(page, "right", testInfo.project.name === "android-chrome");
  await expect(counter).toHaveText(`${count - 1} / ${count}`);
  await page.setViewportSize({ width: 844, height: 390 });
  await assertPhotoFits(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await assertPhotoFits(page);
  await page.screenshot({ path: testInfo.outputPath("gallery-small-mobile.png") });
  await dialog.getByRole("button", { name: "Uždaryti galeriją" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
  await opener.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await opener.click();
  await page.locator(".profile-lightbox").click({ position: { x: 2, y: 2 } });
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});
