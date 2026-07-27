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
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      grepInvert: /@mobile/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: "npm run e2e:server",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
