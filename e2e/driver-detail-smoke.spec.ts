import { test, expect } from '@playwright/test';
import { hasFleetE2ECreds, signInFleet } from './helpers/fleet-auth';

/**
 * Driver detail smoke — Drivers list reachable after sign-in.
 * Mirrors apps/fleet/e2e/driver-detail-smoke.spec.ts for root Playwright testDir.
 *
 * Env: E2E_FLEET_EMAIL, E2E_FLEET_PASSWORD
 */
test.describe('Fleet driver detail smoke', () => {
  test.skip(!hasFleetE2ECreds(), 'E2E_FLEET_EMAIL / E2E_FLEET_PASSWORD not set');

  test('sign-in → Drivers page', async ({ page }) => {
    await signInFleet(page);
    const driversNav = page
      .getByRole('button', { name: /^Drivers$/i })
      .or(page.getByRole('link', { name: /^Drivers$/i }))
      .or(page.getByText(/^Drivers$/i));
    if (await driversNav.first().isVisible().catch(() => false)) {
      await driversNav.first().click();
    } else {
      await page.goto('/?page=drivers');
    }
    await expect(
      page.getByText(/Drivers|Add Driver|Driver Operations|Search drivers/i).first(),
    ).toBeVisible({ timeout: 60_000 });
  });
});
