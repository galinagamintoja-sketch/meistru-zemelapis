import { expect, test } from "@playwright/test";
import { profileSeoSlug } from "../lib/seo";
import type { Specialist } from "../lib/types";

test.skip(!process.env.PLAYWRIGHT_BASE_URL, "Read-only verification against a deployed LocalPro website.");

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  test(`approved photos render across live specialist cards at ${viewport.width}px`, async ({ page, request }) => {
    await page.setViewportSize(viewport);
    const response = await request.get("/api/specialists");
    expect(response.ok()).toBe(true);
    const payload = await response.json();
    const profiles: Specialist[] = Array.isArray(payload) ? payload : payload.specialists;
    await page.goto("/?all=1#results");
    const failures: string[] = [];
    page.on("response", (r) => { if (r.url().includes("profile-photos/") && r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
    let verified = 0;
    for (const profile of profiles) {
      const card = page.locator(`a[href^="/meistrai/${profileSeoSlug(profile)}"]`).filter({ has: page.getByRole("heading", { name: profile.companyName || profile.name, exact: true }) });
      if (!(await card.count())) continue;
      await card.scrollIntoViewIfNeeded();
      const img = card.locator("img");
      await expect(img).toHaveCount(1);
      await expect.poll(() => img.evaluate((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0)).toBe(true);
      if (profile.photoUrls?.length) {
        await expect(card).not.toContainText("Iliustracinė nuotrauka");
        await expect(img).not.toHaveAttribute("src", /trade-defaults|_next\/image/);
      } else {
        await expect(card).toContainText("Iliustracinė nuotrauka");
      }
      verified++;
    }
    expect(verified).toBe(profiles.length);
    const lukmila = page.locator("a").filter({ has: page.getByRole("heading", { name: "Lukmila", exact: true }) });
    await lukmila.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/live-specialist-photos-${viewport.width}.png` });
    expect(failures).toEqual([]);
  });
}

test("a failed card thumbnail falls back to the existing approved original, not an illustration", async ({ page }) => {
  await page.route("**/api/public/profile-photos/*?variant=card", (route) => route.fulfill({ status: 404, body: "Thumbnail unavailable" }));
  await page.goto("/?all=1#results");
  const card = page.locator("a").filter({ has: page.getByRole("heading", { name: "Lukmila", exact: true }) });
  await card.scrollIntoViewIfNeeded();
  const img = card.locator("img");
  await expect(img).toHaveAttribute("src", /\/api\/public\/profile-photos\/[a-f0-9-]+$/);
  await expect.poll(() => img.evaluate((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await expect(card).not.toContainText("Iliustracinė nuotrauka");
});
