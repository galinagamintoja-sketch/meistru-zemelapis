import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the ACTUAL controller and frame in Chromium; only Google transport is stubbed.
// All HTTPS production-origin requests are intercepted locally: nothing reaches LocalPro/Google.
const controller = ts.transpileModule(readFileSync("lib/analytics.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const frameHtml = readFileSync("public/localpro-analytics.html", "utf8");
type API = typeof import("../lib/analytics");
declare global { interface Window { analyticsTest: API; dataLayer: IArguments[] } }

test("real browser consent, isolated frame, router views, conversion dedupe and revocation", async ({ page, context }) => {
  const googleRequests: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "www.googletagmanager.com") {
      googleRequests.push(route.request().url());
      await route.fulfill({ contentType: "application/javascript", body: 'document.cookie="_ga=browser-test;Path=/;Secure;SameSite=Lax";' });
    } else if (url.hostname === "localpro.lt") {
      await route.fulfill({ contentType: "text/html", body: url.pathname === "/localpro-analytics.html" ? frameHtml : "<!doctype html><title>Private Name private@example.lt</title><body><a href='tel:+37060000000'>Private contact</a><input value='Private message'></body>" });
    } else await route.abort();
  });
  await page.goto("https://localpro.lt/meistrai/private-name?email=private@example.lt#private-phone");
  await page.addScriptTag({ content: `(function(){var exports={};${controller};window.analyticsTest=exports;})();` });
  await page.evaluate(() => {
    window.analyticsTest.trackPage(location.pathname + location.search + location.hash);
    window.analyticsTest.trackContact("email");
  });
  expect(googleRequests).toEqual([]);
  await expect(page.locator("iframe")).toHaveCount(0);
  expect((await context.cookies()).filter((cookie) => cookie.name.startsWith("_ga"))).toEqual([]);
  await page.evaluate(() => {
    window.analyticsTest.setAnalyticsConsent("accepted");
    window.analyticsTest.setAnalyticsConsent("accepted");
    window.analyticsTest.trackPage(location.pathname + location.search + location.hash);
  });
  await expect.poll(() => googleRequests.length).toBe(1);
  await expect(page.locator("iframe")).toHaveCount(1);
  const frame = page.frames().find((item) => item.url().includes("localpro-analytics.html"))!;
  await expect.poll(() => frame.evaluate(() => window.dataLayer.filter((args) => args[0] === "event").length)).toBe(1);
  await page.evaluate(() => {
    history.pushState({}, "", "/request?email=private@example.lt#private");
    window.analyticsTest.trackPage(location.pathname + location.search + location.hash);
    window.analyticsTest.trackPage("/request?name=private");
    window.analyticsTest.trackConfirmedConversion("enquiry", { ok: false }, { ok: true, requestId: "failed" });
    window.analyticsTest.trackContact("phone");
    window.analyticsTest.trackConfirmedConversion("enquiry", { ok: true }, { ok: true, requestId: "private-id", email: "private@example.lt" });
    window.analyticsTest.trackConfirmedConversion("enquiry", { ok: true }, { ok: true, requestId: "private-id" });
    window.analyticsTest.trackConfirmedConversion("registration", { ok: true }, { ok: true, profile: { id: "private-profile" } });
  });
  await expect.poll(() => frame.evaluate(() => window.dataLayer.filter((args) => args[0] === "event").length)).toBe(5);
  const commands = await frame.evaluate(() => window.dataLayer.map((args) => Array.from(args)));
  const events = commands.filter((args) => args[0] === "event");
  expect(events.map((args) => args[1])).toEqual(["page_view", "page_view", "contact_click", "generate_lead", "sign_up"]);
  expect(JSON.stringify(commands)).not.toMatch(/private|@|\?|#/i);
  expect(commands.filter((args) => args[0] === "config")).toHaveLength(1);
  // Main router changes never touch iframe history, so history-based enhanced measurement cannot duplicate views.
  expect(await frame.evaluate(() => location.pathname)).toBe("/localpro-analytics.html");
  await page.evaluate(() => window.analyticsTest.setAnalyticsConsent("rejected"));
  await expect(page.locator("iframe")).toHaveCount(0);
  expect((await context.cookies()).filter((cookie) => cookie.name.startsWith("_ga"))).toEqual([]);
  await page.evaluate(() => {
    window.analyticsTest.trackPage("/terms");
    window.analyticsTest.trackContact("email");
  });
  expect(googleRequests).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem(window.analyticsTest.CONSENT_KEY))).toBe("rejected");
});
