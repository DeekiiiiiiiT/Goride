import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerCheckout } from './helpers/rush-customer';

/**
 * Customer UI — checkout screen only (does not Place Order).
 * Run: pnpm test:e2e:rush:customer:checkout
 */
test.describe('Roam Rush customer — checkout', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI checkout — read-only Place Order visible', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerCheckout(page);
  });
});
