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
 *   E2E_FUEL_WEEK_2 / E2E_FUEL_SOAK_MODE / E2E_FUEL_FLIP_ENFORCE — shadow soak smoke
 *   ADMIN_BASE_URL / FLEET_BASE_URL — when set, skip the matching vite preview webServer (CI sets these after build).
 *   CI — when unset locally, webServer uses reuseExistingServer so an already-running dev:testcopy is reused.
 */
const adminBaseUrl = process.env.ADMIN_BASE_URL?.trim();
const fleetBaseUrl = process.env.FLEET_BASE_URL?.trim();
const driverBaseUrl = process.env.DRIVER_BASE_URL?.trim();
/** Local dev often already runs dev:testcopy on 5180/5181; CI must own the port. */
const reuseLocalPreviewServer = !process.env.CI;
const previewWebServers = [
  // Inventory done-tests only build Fleet + Driver; no inventory spec opens Admin.
  // Week Reconciliation done-tests only build Fleet too (WEEK_RECON_E2E=1).
  ...(!adminBaseUrl && process.env.INVENTORY_E2E !== '1' && process.env.WEEK_RECON_E2E !== '1'
    ? [{
        // CI has no apps/admin/.env.testcopy (gitignored), so dev:testcopy would show the
        // setup screen. CI builds admin with VITE_SUPABASE_URL=https://example.supabase.co
        // first; serve that build instead. Locally keep the test copy.
        command: process.env.CI
          ? 'pnpm --filter @roam/admin exec vite preview --host 127.0.0.1 --port 5180 --strictPort'
          : 'pnpm --filter @roam/admin run dev:testcopy',
        url: 'http://127.0.0.1:5180',
        reuseExistingServer: reuseLocalPreviewServer,
        timeout: 120_000,
      }]
    : []),
  ...(!fleetBaseUrl
    ? [{
        command: 'pnpm --filter @roam/fleet run dev:testcopy',
        url: 'http://127.0.0.1:5181',
        reuseExistingServer: reuseLocalPreviewServer,
        timeout: 120_000,
      }]
    : []),
  ...(process.env.INVENTORY_E2E === '1' && !driverBaseUrl
    ? [{
        command: 'pnpm --filter @roam/driver run dev:testcopy',
        url: 'http://127.0.0.1:5182',
        reuseExistingServer: reuseLocalPreviewServer,
        timeout: 120_000,
      }]
    : []),
];

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
    /** A missing button fails fast with a clear error instead of waiting out the 5-minute test timeout. */
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: previewWebServers.length ? previewWebServers : undefined,
  projects: [
    {
      name: 'dominion-admin',
      testMatch: /parts-import-stitch\.spec\.ts|parts-auto-match-stitch\.spec\.ts|add-a-part-stitch\.spec\.ts|add-a-part-done\.spec\.ts|roomy-brakes-trust\.spec\.ts|capture-am-screens\.spec\.ts|dominion-maintenance-master\.spec\.ts|dominion-add-parts-self-serve-capture\.spec\.ts|dominion-vehicles-catalog-capture\.spec\.ts|dominion-vehicles-home-dashboard-capture\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1456, height: 900 },
        baseURL: adminBaseUrl || 'http://127.0.0.1:5180',
      },
    },
    {
      name: 'fleet',
      testMatch: /fleet-rush-integration\.spec\.ts|fuel-recon-wizard\.spec\.ts|fuel-recon-shadow-soak\.spec\.ts|driver-settlements-desk\.spec\.ts|driver-detail-smoke\.spec\.ts|fleet-find-parts-visual\.spec\.ts|parts-import-stitch\.spec\.ts|parts-auto-match-stitch\.spec\.ts|fleet-maintenance-master\.spec\.ts|fleet-maintenance-log-service\.spec\.ts|fleet-vehicle-documents-overlay\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: fleetBaseUrl || 'http://127.0.0.1:5181',
      },
    },
    {
      name: 'inventory',
      testMatch: /inventory-done-test-.+\.spec\.ts/,
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1456, height: 900 },
        baseURL: fleetBaseUrl || 'http://127.0.0.1:5181',
      },
    },
    {
      name: 'week-recon',
      testMatch: /week-recon-done-test-.+\.spec\.ts/,
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1456, height: 900 },
        baseURL: fleetBaseUrl || 'http://127.0.0.1:5181',
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
