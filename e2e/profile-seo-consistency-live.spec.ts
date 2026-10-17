import { test, expect } from "@playwright/test";
import { profileHeading, profilePath, profileBreadcrumbJsonLd } from "../lib/seo";
import { profilePhotoAlt } from "../lib/photo-alt";
import type { Specialist } from "../lib/types";

// Read-only hosted-preview checks; no registrations, edits or database writes.
for (const width of [1440, 390]) {
  test(`public profile breadcrumbs, metadata and photo accessibility agree (${width}px)`, async ({ page, request }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    const response = await request.get("/api/specialists");
    expect(response.ok()).toBeTruthy();
    const { specialists } = await response.json() as { specialists: Specialist[] };
    expect(specialists.length).toBeGreaterThan(0);
    const p = specialists.find((profile) => profile.companyName === "Lukmila") ?? specialists.find((profile) => profile.photoUrls?.length);
    expect(p, "A real public profile with portfolio images is required").toBeTruthy();
    if (!p) throw Error("No public portfolio profile");
    const result = await page.goto(`${profilePath(p)}?return=%2F%3Flocality%3Delsewhere%23results`);
    expect(result?.status()).toBe(200);
    const publicName = p.companyName?.trim() || p.name.trim();
    await expect(page.locator("h1")).toHaveText(profileHeading(p));
    await expect(page).toHaveTitle(`${profileHeading(p)} | LocalPro`);
    const canonical = `https://localpro.lt${profilePath(p)}`;
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical);
    const scripts = page.locator('script[type="application/ld+json"]');
    await expect(scripts).toHaveCount(1);
    const data = JSON.parse(await scripts.innerText());
    expect(data.url).toBe(canonical);
    expect(data.name).toBe(profileHeading(p));
    expect(data.breadcrumb).toEqual(profileBreadcrumbJsonLd(p));
    expect((JSON.stringify(data).match(/"@type":"BreadcrumbList"/g) ?? []).length).toBe(1);
    const breadcrumbs = page.getByRole("navigation", { name: "Naršymo kelias" });
    await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(publicName);
    for (const item of data.breadcrumb.itemListElement.slice(0, -1)) {
      await expect(breadcrumbs.getByRole("link", { name: item.name, exact: true })).toHaveAttribute("href", item.item);
      const parent = await request.get(new URL(item.item).pathname);
      expect(parent.status(), `Breadcrumb target ${item.item}`).toBe(200);
    }
    const hero = page.locator(".public-profile-hero-photo");
    await expect(hero).toHaveAttribute("data-gallery-ready", "true");
    const expectedAlt = profilePhotoAlt(publicName, p.photoLabels?.[p.photoUrls![0]], 0);
    await expect(hero.locator("img")).toHaveAttribute("alt", expectedAlt);
    await expect(page.locator(".public-profile-gallery-button").first().locator("img")).toHaveAttribute("alt", expectedAlt);
    await hero.click();
    const dialog = page.getByRole("dialog", { name: `${publicName} darbų galerija` });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("img")).toHaveAttribute("alt", expectedAlt);
    await expect.poll(() => dialog.locator("img").evaluate((img) => (img as HTMLImageElement).naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
    if (p.photoUrls!.length > 1) {
      await dialog.getByRole("button", { name: "Kita nuotrauka" }).click();
      await expect(dialog.locator("img")).toHaveAttribute("alt", profilePhotoAlt(publicName, p.photoLabels?.[p.photoUrls![1]], 1));
    }
    await dialog.getByRole("button", { name: "Uždaryti galeriją" }).click();
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
}
