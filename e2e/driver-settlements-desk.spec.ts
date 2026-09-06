import { test, expect } from '@playwright/test';
import { hasFleetE2ECreds, signInFleet } from './helpers/fleet-auth';

/**
 * Driver Settlements desk smoke — Collect / Pay / tabs visible.
 * Skip when fleet e2e creds are missing.
 *
 * Env: E2E_FLEET_EMAIL, E2E_FLEET_PASSWORD
 */
test.describe('Fleet driver settlements desk', () => {
  test.skip(!hasFleetE2ECreds(), 'E2E_FLEET_EMAIL / E2E_FLEET_PASSWORD not set');

  test('sign-in → Driver Settlements → Collect/Pay/tabs', async ({ page }) => {
    await signInFleet(page);
    await page.goto('/driver-settlements');
    await expect(
      page.getByRole('button', { name: /Collect|Pay|Log cash|Reconciled/i }).first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Outstanding|Awaiting clear|Done|Driver owes|Fleet owes/i).first()).toBeVisible({
      timeout: 60_000,
    });

    const payBtn = page.getByRole('button', { name: /^Pay$/i }).or(page.getByRole('button', { name: /Pay\b/i }));
    if (await payBtn.first().isVisible().catch(() => false)) {
      await payBtn.first().click();
      await expect(page.getByText(/Outstanding|Awaiting|Done|you owe drivers|Fleet owes/i).first()).toBeVisible({
        timeout: 30_000,
      });
    }
  });
});
