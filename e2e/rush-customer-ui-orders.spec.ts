import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerOrders } from './helpers/rush-customer';

/** Customer UI — orders list. Run: pnpm test:e2e:rush:customer:orders */
test.describe('Roam Rush customer — orders', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI orders — Your Orders list and optional detail', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerOrders(page);
  });
});
