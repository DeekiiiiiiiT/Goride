import { defineConfig, devices } from "@playwright/test";

const port = 3019;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /fleet-find-parts-visual\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  grep: /stitch live PNGs/,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    actionTimeout: 20_000,
  },
  webServer: {
    command: `pnpm --filter @roam/fleet dev --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "ci-placeholder-anon-key",
    },
  },
});
