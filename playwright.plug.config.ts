import { defineConfig, devices } from '@playwright/test';

const appleOn = process.env.PLUG_E2E_APPLE === '1';
const port = appleOn ? 3017 : 3016;
const standInEnv = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'ci-placeholder-anon-key',
  ...(appleOn ? { VITE_PLUG_APPLE: '1' } : {}),
};

export default defineConfig({
  testDir: './e2e',
  testMatch: appleOn
    ? /plug-auth-apple\.spec\.ts/
    : /plug-(journeys|mobile-fit|empty|auth|home|flags|facility)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://127.0.0.1:${port}`,
    actionTimeout: 20_000,
  },
  webServer: {
    command: `pnpm --filter @roam/plug dev --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: standInEnv,
    timeout: 120_000,
  },
});
