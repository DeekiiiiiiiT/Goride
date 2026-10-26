import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /plug-empty\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://127.0.0.1:3016',
  },
  webServer: {
    command: 'pnpm --filter @roam/plug dev --host 127.0.0.1 --port 3016',
    url: 'http://127.0.0.1:3016',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
