import { test, expect } from '@playwright/test';
import {
  FLEET_ALLOW_FINALIZE,
  hasFleetE2ECreds,
  openFuelReconciliation,
  signInFleet,
} from './helpers/fleet-auth';

/**
 * Authenticated Consumption Reconciliation wizard smoke.
 * Skip in CI when fleet creds are missing.
 *
 * Env: E2E_FLEET_EMAIL, E2E_FLEET_PASSWORD
 * Optional: E2E_FUEL_WEEK (YYYY-MM-DD Monday), E2E_FUEL_ALLOW_FINALIZE=1
 */
test.describe('Fleet fuel recon wizard', () => {
  test.skip(!hasFleetE2ECreds(), 'E2E_FLEET_EMAIL / E2E_FLEET_PASSWORD not set');

  test('sign-in → recon landing → wizard shell', async ({ page }) => {
    await signInFleet(page);
    await openFuelReconciliation(page);
    await expect(
      page.getByText(/Consumption Reconciliation|Outstanding|In progress|Completed/i).first(),
    ).toBeVisible({ timeout: 60_000 });

    const week = process.env.E2E_FUEL_WEEK?.trim();
    if (week) {
      await openFuelReconciliation(page, { week, step: 'data-quality' });
      await expect(
        page.getByText(/Data looks clear|Review flagged|Exception fills|Ready to lock|Week is locked/i).first(),
      ).toBeVisible({ timeout: 90_000 });
      // Step strip / continue footer present
      await expect(page.getByRole('button', { name: /Continue|Finalize/i }).first()).toBeVisible({
        timeout: 30_000,
      });
    } else {
      // Open first available period card if present
      const openBtn = page.getByRole('button', { name: /to review|Open week|Review/i }).first();
      if (await openBtn.isVisible().catch(() => false)) {
        await openBtn.click();
        await expect(
          page.getByText(/Data looks clear|Review flagged|Exception fills|Continue/i).first(),
        ).toBeVisible({ timeout: 90_000 });
      }
    }
  });

  test('deep-link step=finalize shows finalize surface when week set', async ({ page }) => {
    const week = process.env.E2E_FUEL_WEEK?.trim();
    test.skip(!week, 'E2E_FUEL_WEEK not set');
    await signInFleet(page);
    await openFuelReconciliation(page, { week: week!, step: 'finalize' });
    await expect(
      page.getByText(/Ready to lock|Can’t finalize|Week is locked|second approval|system second/i).first(),
    ).toBeVisible({ timeout: 90_000 });
  });

  test('destructive finalize gated', async ({ page }) => {
    test.skip(!FLEET_ALLOW_FINALIZE, 'E2E_FUEL_ALLOW_FINALIZE!=1');
    const week = process.env.E2E_FUEL_WEEK?.trim();
    test.skip(!week, 'E2E_FUEL_WEEK not set');
    await signInFleet(page);
    await openFuelReconciliation(page, { week: week!, step: 'finalize' });
    const finalize = page.getByRole('button', { name: /Finalize week/i });
    await expect(finalize).toBeVisible({ timeout: 60_000 });
    await finalize.click();
    await expect(page.getByText(/locked|Completed|incomplete/i).first()).toBeVisible({
      timeout: 120_000,
    });
  });
});
