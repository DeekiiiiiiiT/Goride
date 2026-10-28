import { defineConfig, devices } from '@playwright/test';

const port = 3018;

export default defineConfig({
  testDir: './e2e',
  testMatch: /dominion-places\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    actionTimeout: 20_000,
  },
  webServer: {
    command: `pnpm --filter @roam/admin dev --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'ci-placeholder-anon-key',
    },
  },
});
