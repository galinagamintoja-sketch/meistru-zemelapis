import { expect, test } from "@playwright/test";

test.describe("public profile defensive mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("contains extreme profile text without horizontal overflow", async ({ page, request }) => {
    const response = await request.get("/api/specialists");
    expect(response.ok()).toBe(true);
    const payload = await response.json();
    const specialists = Array.isArray(payload) ? payload : payload.specialists ?? payload.data ?? [];
    expect(specialists.length).toBeGreaterThan(0);

    await page.goto(`/specialist/${specialists[0].id}`);
    await expect(page.locator(".public-profile-card")).toBeVisible();

    const extreme = "LABAIILGASNEPERTRAUKIAMASTEKSTAS".repeat(14);
    await page.locator(".public-profile-header h1").evaluate((element, value) => { element.textContent = value; }, extreme);
    await page.locator(".public-profile-main p").evaluateAll((elements, value) => {
      for (const element of elements) element.textContent = value;
    }, extreme);
    await page.locator(".public-profile-card .tag").evaluateAll((elements, value) => {
      for (const element of elements) element.textContent = value;
    }, extreme);
    await page.locator(".public-profile-actions a").evaluateAll((elements, value) => {
      for (const element of elements) element.textContent = value;
    }, extreme);

    const result = await page.evaluate(() => {
      const card = document.querySelector(".public-profile-card")!.getBoundingClientRect();
      const offenders = Array.from(document.querySelectorAll(".public-profile-card *"))
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.right > card.right + 1 || box.left < card.left - 1;
        })
        .map((element) => element.className || element.tagName);
      return {
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        offenders
      };
    });

    expect(result.documentOverflow).toBe(false);
    expect(result.offenders).toEqual([]);
  });
});
