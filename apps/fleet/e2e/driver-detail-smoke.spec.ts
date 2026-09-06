import { test, expect } from '@playwright/test';
import { hasFleetE2ECreds, signInFleet } from '../../../e2e/helpers/fleet-auth';

/**
 * Driver detail smoke — Drivers list reachable after sign-in; opens a driver when rows exist.
 * Prefer root e2e/driver-detail-smoke.spec.ts for Playwright testDir.
 *
 * Env: E2E_FLEET_EMAIL, E2E_FLEET_PASSWORD
 */
test.describe('Fleet driver detail smoke', () => {
  test.skip(!hasFleetE2ECreds(), 'E2E_FLEET_EMAIL / E2E_FLEET_PASSWORD not set');

  test('sign-in → Drivers page → open driver detail when roster has a row', async ({ page }) => {
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

    const driverRow = page.locator('table tbody tr').filter({ hasText: /.+/ }).first();
    const rowVisible = await driverRow.isVisible().catch(() => false);
    if (!rowVisible) {
      test.info().annotations.push({ type: 'note', description: 'No driver rows — list smoke only' });
      return;
    }

    await driverRow.click();
    await expect(page).toHaveURL(/\/drivers\//, { timeout: 30_000 });
  });
});
