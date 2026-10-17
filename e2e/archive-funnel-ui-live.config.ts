import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", testMatch: "archive-funnel-ui-live.spec.ts", timeout: 150_000, workers: 1, use: { browserName: "chromium" } });
