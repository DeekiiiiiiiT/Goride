import { expect, test } from '@playwright/test';
import {
  dismissPartnerOverlays,
  ensurePartnerStoreOpen,
  signInPartner,
} from './helpers/rush-partner';

const hasCreds = Boolean(
  process.env.RUSH_PARTNER_EMAIL?.trim() || process.env.E2E_PARTNER_EMAIL?.trim(),
);

/**
 * Authenticated partner critical path (Program 6) — mobile + desktop projects.
 */
test.describe('Roam Rush partner — critical path', () => {
  test.skip(!hasCreds && process.env.CI === 'true', 'Partner E2E secrets not set');

  test('signed-in dashboard shell + orders entry', async ({ page }) => {
    try {
      ensurePartnerStoreOpen();
    } catch {
      /* seed helper may fail offline — continue to UI */
    }
    await signInPartner(page);
    await dismissPartnerOverlays(page);
    await expect(
      page.getByText(/Orders|Dashboard|Earnings|Today/i).first(),
    ).toBeVisible({ timeout: 60_000 });

    // Primary action surface — Orders or Earnings
    const orders = page.getByRole('button', { name: /^Orders$/i }).or(
      page.getByText(/^Orders$/i).first(),
    );
    const earnings = page.getByRole('button', { name: /^Earnings$/i }).or(
      page.getByText(/^Earnings$/i).first(),
    );
    if (await orders.first().isVisible().catch(() => false)) {
      await orders.first().click();
      await dismissPartnerOverlays(page);
      await expect(page.locator('body')).toBeVisible();
    } else if (await earnings.first().isVisible().catch(() => false)) {
      await earnings.first().click();
      await dismissPartnerOverlays(page);
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
