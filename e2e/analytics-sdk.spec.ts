import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Real Google SDK is downloaded/executed. Every collection request is intercepted,
// so synthetic fixture visits/conversions never contaminate the real property.
const controller = ts.transpileModule(readFileSync("lib/analytics.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const html = readFileSync("public/localpro-analytics.html", "utf8");
test("real Google SDK constructs sanitized collection only after opt-in", async ({ page, context }) => {
  const collected: { url: string; body: string; referer: string }[] = [];
  let scripts = 0;
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "localpro.lt") {
      await route.fulfill({ contentType: "text/html", body: url.pathname === "/localpro-analytics.html" ? html : "<!doctype html><title>PRIVATE_MARKER private@example.invalid</title><body><input value='PRIVATE_MARKER'><a href='tel:PRIVATE_MARKER'>Phone</a></body>" });
    } else if (url.hostname === "www.googletagmanager.com" && url.pathname === "/gtag/js") {
      scripts++;
      const response = await route.fetch({ timeout: 20_000 });
      expect(response.status()).toBe(200);
      await route.fulfill({ response });
    } else if (url.hostname.endsWith("google-analytics.com") && /collect/.test(url.pathname)) {
      collected.push({ url: request.url(), body: request.postData() ?? "", referer: request.headers().referer ?? "" });
      await route.fulfill({ status: 204 });
    } else await route.abort();
  });
  await page.goto("https://localpro.lt/meistrai/PRIVATE_MARKER?email=private@example.invalid#PRIVATE_MARKER");
  await page.addScriptTag({ content: `(function(){var exports={};${controller};window.analyticsTest=exports;})();` });
  await page.evaluate(() => { window.analyticsTest.trackPage(location.href); window.analyticsTest.trackContact("phone"); });
  expect(scripts).toBe(0);
  expect(collected).toHaveLength(0);
  await page.evaluate(() => { window.analyticsTest.setAnalyticsConsent("accepted"); window.analyticsTest.trackPage(location.pathname); });
  await expect.poll(() => collected.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(scripts).toBe(1);
  expect(JSON.stringify(collected)).not.toMatch(/PRIVATE_MARKER|private%40|private@example|private%2540/i);
  const requests = collected.map(item => new URLSearchParams(new URL(item.url).search.slice(1) + "&" + item.body));
  expect(requests.some(params => params.get("dl") === "https://localpro.lt/meistrai/profile")).toBe(true);
  expect(requests.some(params => params.get("en") === "page_view")).toBe(true);
  await page.evaluate(() => window.analyticsTest.setAnalyticsConsent("rejected"));
  await expect(page.locator("iframe")).toHaveCount(0);
});
