import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "public-profile-gallery.spec.ts",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  projects: [
    { name: "android-chrome", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "iphone-safari", use: { ...devices["iPhone 13"], browserName: "webkit" } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }
  ]
});
