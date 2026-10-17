import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Hydrate the exact hosted preview on an intercepted production origin so the
// REAL production-only controller runs. Google collection never leaves this test.
// Only the OAuth return and successful profile acknowledgment are fixtures.
const controller = ts.transpileModule(readFileSync("lib/analytics.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const frameHtml = readFileSync("public/localpro-analytics.html", "utf8");
const stageNames = ["archive_visit", "archive_registration_prompt", "archive_register_click", "archive_registration_complete"];

test("hosted archive dialog and real SDK preserve the consented funnel across an OAuth-return fixture", async ({ page, context }) => {
  const preview = process.env.PLAYWRIGHT_BASE_URL;
  test.skip(!preview, "Set PLAYWRIGHT_BASE_URL to the exact final preview deployment");
  const source = new URL(preview!);
  expect(source.hostname).toMatch(/\.vercel\.app$/);
  const collection: { url: string; body: string; referrer: string }[] = [];
  let fixtureReturned = false;
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname.endsWith("google-analytics.com") && /collect/.test(url.pathname)) {
      collection.push({ url: request.url(), body: request.postData() ?? "", referrer: request.headers().referer ?? "" });
      return route.fulfill({ status: 204 });
    }
    if (url.hostname === "www.googletagmanager.com" && url.pathname === "/gtag/js") {
      const response = await route.fetch({ timeout: 25_000 });
      expect(response.status()).toBe(200);
      return route.fulfill({ response });
    }
    if (url.hostname !== "localpro.lt") return route.abort();
    if (url.pathname === "/localpro-analytics.html") return route.fulfill({ contentType: "text/html", body: frameHtml });
    if (url.pathname === "/auth/google") {
      fixtureReturned = true;
      return route.fulfill({ status: 302, headers: { location: "https://localpro.lt/meistro-registracija?private=PRIVATE_MARKER" } });
    }
    if (fixtureReturned && url.pathname === "/meistro-registracija") {
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><title>PRIVATE_MARKER</title><body><h1>Controlled OAuth-return fixture</h1><script>(function(){var exports={};${controller};window.analyticsTest=exports;window.analyticsTest.setAnalyticsConsent(window.analyticsTest.readAnalyticsConsent());window.analyticsTest.trackPage(location.pathname);})();</script></body>` });
    }
    // These are GETs to public preview pages/assets only, never production mutations.
    if (request.method() !== "GET") return route.abort();
    return route.fulfill({ response: await route.fetch({ url: source.origin + url.pathname + url.search, timeout: 30_000 }) });
  });
  const events = () => collection.flatMap(item => {
    const common = new URL(item.url).search;
    return (item.body ? item.body.split("\n") : [""]).map(line => {
      const params = new URLSearchParams(common);
      new URLSearchParams(line).forEach((value, key) => params.set(key, value));
      return params.get("en");
    });
  });
  await page.goto("https://localpro.lt/darbu-skelbimai?private=PRIVATE_MARKER#PRIVATE_MARKER");
  await expect(page.getByRole("heading", { name: "Darbų skelbimai", exact: true })).toBeVisible();
  expect(collection).toHaveLength(0);
  await page.getByRole("button", { name: "Sutinku su statistika", exact: true }).click();
  await expect.poll(() => events().includes("archive_visit"), { timeout: 30_000 }).toBe(true);
  await page.getByRole("button", { name: "Rodyti daugiau", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => events().includes("archive_registration_prompt"), { timeout: 30_000 }).toBe(true);
  await page.getByRole("link", { name: /Tęsti su Google nemokamai/ }).click();
  await page.waitForURL("**/meistro-registracija?private=PRIVATE_MARKER");
  // Confirmed-response boundary only: no real profile or Google account is created.
  await page.evaluate(() => window.analyticsTest.trackConfirmedConversion("registration", { ok: true }, { ok: true, profile: { id: "PRIVATE_MARKER" } }));
  await expect.poll(() => events().filter(name => name && stageNames.includes(name)), { timeout: 30_000 }).toEqual(stageNames);
  expect(events().filter(name => name === "sign_up")).toHaveLength(1);
  expect(JSON.stringify(collection)).not.toContain("PRIVATE_MARKER");
  await page.evaluate(() => window.analyticsTest.setAnalyticsConsent("rejected"));
  await expect(page.locator("iframe")).toHaveCount(0);
});
