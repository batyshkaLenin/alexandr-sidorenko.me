import { defineConfig, devices } from "@playwright/test";

const publicDir = process.env.PUBLIC_DIR || "public";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173";

/**
 * Chromium-only local suite (T31). Serves the built public tree with the
 * site's canonical URL shape — never `hugo server`.
 */
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `python3 scripts/serve-public.py --host 127.0.0.1 --port 4173 --enable-sw-test-network-failures --public-dir ${JSON.stringify(publicDir)}`,
    url: `${baseURL}/`,
    // Never reuse: a leftover server may still be serving ./public (or a
    // hugo-server rewrite) while PUBLIC_DIR points at tmp/release-public.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
