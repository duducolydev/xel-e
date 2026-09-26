import { defineConfig, devices } from "@playwright/test";

// Ports dédiés : la suite ne se branche jamais par erreur sur un `pnpm dev` en cours.
const PORT_API = 3101;
const PORT_WEB = 3110;
const baseURL = `http://localhost:${PORT_WEB}`;

// Durée de vie courte pour que le test de rotation observe une vraie expiration de l'accès.
export const TTL_ACCES_E2E_SECONDES = 20;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    locale: "fr-FR",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @xel-e/api exec nest start",
      url: `http://127.0.0.1:${PORT_API}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        API_PORT: String(PORT_API),
        APP_URL: baseURL,
        JWT_ACCESS_TTL_SECONDS: String(TTL_ACCES_E2E_SECONDES),
      },
    },
    {
      command: `pnpm --filter @xel-e/web exec next dev --turbopack -p ${PORT_WEB}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_URL: `http://127.0.0.1:${PORT_API}` },
    },
  ],
});
