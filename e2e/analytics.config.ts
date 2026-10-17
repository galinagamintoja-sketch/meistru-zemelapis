import { defineConfig } from "@playwright/test";

// Offline browser harness: no application server/build, credentials, or production writes.
export default defineConfig({
  testDir: ".",
  testMatch: "analytics.spec.ts",
  use: { browserName: "chromium", headless: true },
  reporter: "list",
  outputDir: "../tmp/analytics-browser-results"
});
