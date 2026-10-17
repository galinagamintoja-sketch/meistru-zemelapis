import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", testMatch: "analytics-sdk.spec.ts", timeout: 60_000, workers: 1, use: { browserName: "chromium" } });
