import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerCart } from './helpers/rush-customer';

/** Customer UI — cart with item. Run: pnpm test:e2e:rush:customer:cart */
test.describe('Roam Rush customer — cart', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI cart — item summary and Go to Checkout', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerCart(page);
  });
});
