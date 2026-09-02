import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests for Roam Rush UI flows.
 * API smokes stay in scripts/smoke-*.mjs — this suite covers UI-only checks.
 *
 * Run all:     pnpm test:e2e:rush
 * Customer:    pnpm test:e2e:rush:customer
 * Customer area: pnpm test:e2e:rush:customer:<auth|shell|home|search|store|cart|checkout|cart-conflict|orders|account|profile|addresses|payment|promotions|favorites|notifications|help|about>
 * Partner:     pnpm test:e2e:rush:partner          (mobile + desktop)
 * Partner mobile only:  pnpm test:e2e:rush:partner:mobile
 * Partner desktop only: pnpm test:e2e:rush:partner:desktop
 *
 * Env:
 *   RUSH_BASE_URL / PARTNER_BASE_URL / FLEET_BASE_URL
 *   RUSH_CUSTOMER_EMAIL / RUSH_CUSTOMER_PASSWORD (or E2E_CUSTOMER_*)
 *   RUSH_PARTNER_EMAIL / RUSH_PARTNER_PASSWORD (or E2E_PARTNER_*)
 *   E2E_FLEET_EMAIL / E2E_FLEET_PASSWORD — fleet wizard E2E
 *   E2E_FUEL_WEEK / E2E_FUEL_ALLOW_FINALIZE=1 — optional deep-link / destructive finalize
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 300_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'fleet',
      testMatch: /fleet-rush-integration\.spec\.ts|fuel-recon-wizard\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.FLEET_BASE_URL?.trim() || 'http://localhost:5173',
      },
    },
    {
      name: 'customer',
      testMatch: /rush-customer.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.RUSH_BASE_URL?.trim() || 'https://roamrush.app',
      },
    },
    {
      name: 'partner-mobile',
      testMatch: /rush-partner.*\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        baseURL: process.env.PARTNER_BASE_URL?.trim() || 'https://partner.roamrush.app',
      },
    },
    {
      name: 'partner-desktop',
      testMatch: /rush-partner.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        baseURL: process.env.PARTNER_BASE_URL?.trim() || 'https://partner.roamrush.app',
      },
    },
  ],
});
