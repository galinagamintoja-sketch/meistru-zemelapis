import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile-portrait", width: 360, height: 800 },
  { name: "mobile-landscape", width: 800, height: 360 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 1000 }
];

test("Lithuania remains the permanent map territory across responsive sizes", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: false, hasProfile: false, isAdmin: false } }));
  await page.goto("/");
  const map = page.locator(".real-map");
  await expect(map).toBeVisible();
  await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible({ timeout: 15_000 });

  for (const viewport of viewports) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await map.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);

      const zoomOut = map.locator(".leaflet-control-zoom-out");
      const mapBox = await map.boundingBox();
      if (mapBox) {
        await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
        for (let index = 0; index < 12; index += 1) {
          await page.mouse.wheel(0, 800);
          await page.waitForTimeout(80);
        }
      }
      await expect(zoomOut).toHaveClass(/leaflet-disabled/);

      const box = await map.boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;

      for (const [dx, dy] of [[700, 0], [-700, 0], [0, 700], [0, -700]] as const) {
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + dx, startY + dy, { steps: 8 });
        await page.mouse.up();
      }

      const search = page.getByRole("button", { name: "Ieškoti šioje žemėlapio vietoje" });
      await expect(search).toBeVisible();
      const requestPromise = page.waitForRequest((request) => request.url().includes("/api/specialists?") && request.url().includes("lat="));
      await search.click();
      const request = await requestPromise;
      const url = new URL(request.url());
      const lat = Number(url.searchParams.get("lat"));
      const lng = Number(url.searchParams.get("lng"));
      expect(lat).toBeGreaterThanOrEqual(53.8);
      expect(lat).toBeLessThanOrEqual(56.5);
      expect(lng).toBeGreaterThanOrEqual(20.5);
      expect(lng).toBeLessThanOrEqual(27);
      await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
    });
  }

  const seedResponse = await page.request.get("/api/specialists?customerRadiusKm=100");
  const seedPayload = await seedResponse.json() as { specialists: unknown[] };
  let resultMode: "empty" | "one" | "spread" = "empty";
  await page.route("**/api/specialists?**", (route) => {
    const specialists = resultMode === "empty"
      ? []
      : resultMode === "one"
        ? seedPayload.specialists.slice(0, 1)
        : [seedPayload.specialists[0], seedPayload.specialists.at(-1)].filter(Boolean);
    return route.fulfill({ json: { specialists } });
  });
  const locationInput = page.locator('input[list="localpro-cities"]');

  await locationInput.fill("Vilnius");
  await expect(page.getByText("Nėra atitikmenų", { exact: true })).toBeVisible();
  await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();

  resultMode = "one";
  await locationInput.fill("Kaunas");
  await expect.poll(() => map.locator(".trade-marker").count()).toBe(1);

  resultMode = "spread";
  await locationInput.fill("Klaipėda");
  await expect.poll(() => map.locator(".trade-marker, .trade-cluster").count()).toBeGreaterThan(0);
  await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();

  const session = await page.context().newCDPSession(page);
  const box = await map.boundingBox();
  if (box) {
    for (let index = 0; index < 5; index += 1) {
      await session.send("Input.synthesizePinchGesture", {
        x: Math.round(box.x + box.width / 2),
        y: Math.round(box.y + box.height / 2),
        scaleFactor: 0.1,
        relativeSpeed: 800,
        gestureSourceType: "touch"
      });
      await page.waitForTimeout(150);
    }
    await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
  }
});
