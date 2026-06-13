import { defineConfig, devices } from "@playwright/test";

const port = Number.parseInt(process.env.PORT ?? "3101", 10);
const baseURL = `http://127.0.0.1:${Number.isFinite(port) ? port : 3101}`;
const ambientDirector = process.env.AMBIENT === "1";
const ambientReal = process.env.AMBIENT_REAL === "1";
const fullClearCampaign = process.env.FULLCLEAR === "1";
const fullClearTimeoutMs = ambientReal ? 150 * 60 * 1000 : 60 * 60 * 1000;
const isCI = process.env.CI === "true";
const desktopChrome = {
  ...devices["Desktop Chrome"],
  ...(isCI ? { channel: "chrome" as const } : {}),
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    testIdAttribute: "data-testid",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /full-clear\.spec\.ts/,
      use: desktopChrome,
    },
    ...(fullClearCampaign
      ? [
          {
            name: "fullclear",
            testMatch: /full-clear\.spec\.ts/,
            timeout: fullClearTimeoutMs,
            use: {
              ...desktopChrome,
              actionTimeout: 30_000,
            },
          },
        ]
      : []),
  ],
  webServer: {
    command: "pnpm run dev",
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
      PATH: process.env.PATH,
      AMBIENT: ambientDirector ? "1" : "0",
      ...(process.env.AMBIENT_REAL ? { AMBIENT_REAL: process.env.AMBIENT_REAL } : {}),
      ...(fullClearCampaign ? { DIRECTOR: process.env.DIRECTOR ?? "fallback" } : {})
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
    stdout: process.env.CI ? "pipe" : "ignore",
    stderr: process.env.CI ? "pipe" : "pipe",
  },
});
