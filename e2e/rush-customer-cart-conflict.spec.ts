import { expect, test } from '@playwright/test';
import {
  addFirstMenuItem,
  goBackFromStore,
  resetCustomerStorage,
  signInCustomer,
} from './helpers/rush-customer';

/**
 * UI smoke: cross-store cart conflict modal.
 * Keep API checkout/order checks in scripts/smoke-customer-*.mjs.
 */
test.describe('Roam Rush customer — cart conflict', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('shows Start a new cart? when adding from a second restaurant', async ({ page }) => {
    await signInCustomer(page);

    // Store A
    await page.getByRole('button', { name: /Island Grill Jamaican/i }).click();
    await expect(page.getByRole('heading', { name: 'Island Grill', level: 1 })).toBeVisible();
    await addFirstMenuItem(page);
    await expect(page.getByRole('button', { name: /View cart/i })).toBeVisible();

    await goBackFromStore(page);
    // If cart sheet opened (cart bar intercept), close it and land on home.
    if (await page.getByRole('heading', { name: 'Your Cart' }).isVisible().catch(() => false)) {
      await page.locator('button').filter({ hasText: 'close' }).first().click();
    }
    await expect(page.getByRole('heading', { name: 'Popular near you' })).toBeVisible({
      timeout: 15_000,
    });

    // Store B — different merchant should trigger conflict modal
    await page.getByRole('button', { name: /Green Life Bowls Healthy/i }).click();
    await expect(page.getByRole('heading', { name: 'Green Life Bowls', level: 1 })).toBeVisible();
    await addFirstMenuItem(page);

    await expect(page.getByRole('heading', { name: 'Start a new cart?' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Clear Cart/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Start a new cart?' })).toBeHidden();
  });
});
