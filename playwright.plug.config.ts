import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /plug-journeys\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  use: {
    ...devices['Pixel 5'],
    viewport: { width: 390, height: 844 },
    baseURL: 'http://127.0.0.1:3016',
    actionTimeout: 8_000,
  },
  webServer: {
    command: 'pnpm --filter @roam/plug dev --host 127.0.0.1 --port 3016',
    url: 'http://127.0.0.1:3016',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-demo-anon',
    },
  },
});
