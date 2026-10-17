import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// A tiny offline CJS loader, not a mock React renderer: executes the real component,
// React/ReactDOM, controller and frame. Next routing and all network are stubbed.
const modules: Record<string, string> = {};
for (const [name, file] of Object.entries({
  react: "react/cjs/react.development.js",
  "react/jsx-runtime": "react/cjs/react-jsx-runtime.development.js",
  "react-dom": "react-dom/cjs/react-dom.development.js",
  "react-dom/client": "react-dom/cjs/react-dom-client.development.js",
  scheduler: "scheduler/cjs/scheduler.development.js"
})) modules[name] = readFileSync(`node_modules/${file}`, "utf8");
for (const [name, file] of Object.entries({ "../lib/analytics": "lib/analytics.ts", jobs: "components/JobsPageClient.tsx" })) {
  modules[name] = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
}
modules["./JobsPageClient.module.css"] = "module.exports={};";
modules["next/link"] = "module.exports=function Link(p){return require('react').createElement('a',p,p.children)}";
modules["next/navigation"] = "exports.useRouter=function(){return router}";
const factories = Object.entries(modules).map(([name, source]) => `${JSON.stringify(name)}:function(module,exports,require){${source}\n}`).join(",");
const bootstrap = `(function(){var process={env:{NODE_ENV:'development'}}, router={push:function(url){window.routerPushes.push(url)}}, cache={}, modules={${factories}};
function require(name){if(cache[name])return cache[name].exports;var module=cache[name]={exports:{}};modules[name](module,module.exports,require);return module.exports;}
window.routerPushes=[];window.analyticsTest=require('../lib/analytics');
window.mountJobs=function(access){var React=require('react');var root=require('react-dom/client').createRoot(document.getElementById('root'));root.render(React.createElement(React.StrictMode,null,React.createElement(require('jobs').default,{initialAccess:access,initialFilters:{trade:'',service:'',area:'PrivateTown',period:'all',contactOnly:false},initialTaxonomy:{trades:[],services:[],areas:[]},initialFeed:{jobs:[],next_cursor:'next-page',has_more:true}})));};})();`;
const frameHtml = readFileSync("public/localpro-analytics.html", "utf8");
declare global { interface Window { mountJobs: (access: string) => void; routerPushes: string[] } }

async function inject(page: Page, accepted: boolean, access = "guest") {
  await page.addScriptTag({ content: bootstrap });
  await page.evaluate(({ accepted, access }) => {
    window.analyticsTest.setAnalyticsConsent(accepted ? "accepted" : "rejected");
    window.analyticsTest.trackPage(location.pathname + location.search);
    window.mountJobs(access);
  }, { accepted, access });
}
async function events(page: Page): Promise<string[]> {
  const frame = page.frames().find((frame) => frame.url().includes("localpro-analytics.html"));
  if (!frame) return [];
  return frame.evaluate(() => window.dataLayer.filter((args) => args[0] === "event").map((args) => String(args[1])));
}

test.beforeEach(async ({ context, page }) => {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "www.googletagmanager.com") await route.fulfill({ contentType: "application/javascript", body: "/* offline transport */" });
    else if (url.hostname === "localpro.lt") await route.fulfill({ contentType: "text/html", body: url.pathname === "/localpro-analytics.html" ? frameHtml : "<!doctype html><title>Private email@example.lt</title><body><div id='root'></div></body>" });
    else await route.abort();
  });
  await page.goto("https://localpro.lt/darbu-skelbimai?area=PrivateTown");
});

test("actual dialog and explicit Google CTA produce ordered stages and preserve attribution across full navigation", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await inject(page, true);
  await expect.poll(() => events(page)).toEqual(["archive_visit", "page_view"]);
  await page.getByRole("button", { name: "Rodyti daugiau" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => events(page)).toEqual(["archive_visit", "page_view", "archive_registration_prompt"]);
  const before = await page.evaluate(() => JSON.parse(sessionStorage.getItem(window.analyticsTest.ARCHIVE_JOURNEY_KEY)!));
  await page.getByRole("button", { name: "Dabar ne" }).click();
  await expect(page.getByRole("button", { name: "Rodyti daugiau" })).toBeFocused();
  await page.getByRole("button", { name: "Rodyti daugiau" }).click();
  const cta = page.getByRole("link", { name: "Tęsti su Google nemokamai" });
  await expect(cta).toHaveAttribute("href", "/auth/google?next=%2Fdarbu-skelbimai%3Farea%3DPrivateTown");
  // Inspect the actual CTA event, then repeat the click with normal full navigation.
  await page.evaluate(() => document.addEventListener("click", (event) => event.preventDefault(), { once: true }));
  await cta.click();
  await expect.poll(() => events(page)).toEqual(["archive_visit", "page_view", "archive_registration_prompt", "archive_register_click"]);
  await cta.click();
  await page.waitForURL("**/auth/google?**");
  const clicked = await page.evaluate(() => JSON.parse(sessionStorage.getItem("localpro.archive-journey.v1")!));
  expect(clicked).toEqual({ v: 1, stage: 3, expires: before.expires });
  await page.goto("https://localpro.lt/meistro-registracija?google=private");
  await page.addScriptTag({ content: bootstrap });
  await page.evaluate(() => {
    window.analyticsTest.setAnalyticsConsent("accepted", false);
    window.analyticsTest.trackConfirmedConversion("registration", { ok: true }, { ok: true, profile: { id: "private-id" }, email: "private@example.lt" });
    window.analyticsTest.trackConfirmedConversion("registration", { ok: true }, { ok: true, profile: { id: "private-id" } });
  });
  await expect.poll(() => events(page)).toEqual(["sign_up", "archive_registration_complete"]);
  const serialized = await page.frames().find((frame) => frame.url().includes("localpro-analytics.html"))!.evaluate(() => JSON.stringify(window.dataLayer.map((args) => Array.from(args))));
  expect(serialized).not.toMatch(/PrivateTown|private-id|private@example|\?google/);
  expect(errors).toEqual([]);
});

test("actual CTA without consent stores no attribution; later acceptance does not replay the dialog or click", async ({ page }) => {
  await inject(page, false);
  await page.getByRole("button", { name: "Rodyti daugiau" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // Prevent navigation only, not the actual React CTA callback.
  await page.evaluate(() => document.addEventListener("click", (event) => event.preventDefault()));
  await page.getByRole("link", { name: "Tęsti su Google nemokamai" }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("localpro.archive-journey.v1"))).toBeNull();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.evaluate(() => {
    window.analyticsTest.setAnalyticsConsent("accepted");
    window.analyticsTest.trackPage(location.pathname);
    window.analyticsTest.trackConfirmedConversion("registration", { ok: true }, { ok: true, profile: { id: "new" } });
  });
  await expect.poll(() => events(page)).toEqual(["archive_visit", "page_view", "sign_up"]);
});

test("profile-required Rodyti daugiau redirect is unchanged and never counts a prompt or Google click", async ({ page }) => {
  await inject(page, true, "registration");
  await page.getByRole("button", { name: "Rodyti daugiau" }).click();
  expect(await page.evaluate(() => window.routerPushes)).toEqual(["/meistro-registracija?next=%2Fdarbu-skelbimai%3Farea%3DPrivateTown"]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => events(page)).toEqual(["archive_visit", "page_view"]);
});
