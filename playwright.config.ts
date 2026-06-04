import { defineConfig, devices } from "@playwright/test";

/**
 * Layer 3 — integration tests against the running Next.js app with the mock
 * HCM route handlers active (TRD §8.3). Playwright boots the dev server and
 * drives real browser flows end-to-end.
 */
export default defineConfig({
  testDir: "./tests/integration",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Make integration runs deterministic: disable random silent failures
      // and the anniversary scheduler unless a test explicitly opts in.
      HCM_SILENT_FAILURE_RATE: "0",
      HCM_ANNIVERSARY_INTERVAL_MS: "0",
    },
  },
});
