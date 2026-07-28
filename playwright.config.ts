import { defineConfig, devices } from "@playwright/test";
import fs from "fs";

// The CI/sandbox environment pre-installs Chromium at /opt/pw-browsers.
// PLAYWRIGHT_BROWSERS_PATH normally resolves it; the explicit executablePath
// fallback covers version-mismatched @playwright/test installs.
const preinstalledChromium = "/opt/pw-browsers/chromium";
const executablePath = fs.existsSync(preinstalledChromium)
  ? preinstalledChromium
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  // Tag conventions:
  //   @mobile — phone-viewport flow tests; run once, on Pixel 7.
  //   @field  — read-only layout checks; run at EVERY width below, so they
  //             must stay mutation-free (the same assertions execute four
  //             times against shared data).
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      grepInvert: /@mobile/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      grep: /@mobile|@field/,
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 14"] },
      grep: /@field/,
    },
    {
      name: "android-small",
      use: { ...devices["Galaxy S8"] },
      grep: /@field/,
    },
    {
      name: "tablet",
      use: { ...devices["iPad Mini"] },
      grep: /@field/,
    },
  ],
  webServer: {
    command: "npm run e2e:server",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
