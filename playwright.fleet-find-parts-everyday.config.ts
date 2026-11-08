import { defineConfig, devices } from "@playwright/test";

const port = 3020;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /fleet-find-parts-everyday-capture\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    actionTimeout: 30_000,
  },
  webServer: {
    command: `pnpm --filter @roam/fleet dev --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "ci-placeholder-anon-key",
    },
  },
});
