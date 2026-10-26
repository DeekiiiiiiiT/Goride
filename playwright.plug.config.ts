import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /plug-(journeys|mobile-fit|empty|auth|home|flags)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://127.0.0.1:3016',
    actionTimeout: 20_000,
  },
  webServer: {
    command: 'pnpm --filter @roam/plug dev --host 127.0.0.1 --port 3016',
    url: 'http://127.0.0.1:3016',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'ci-placeholder-anon-key',
    },
    timeout: 120_000,
  },
});
