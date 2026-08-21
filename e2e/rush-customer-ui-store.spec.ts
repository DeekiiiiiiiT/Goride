import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerStore } from './helpers/rush-customer';

/** Customer UI — open Island Grill menu. Run: pnpm test:e2e:rush:customer:store */
test.describe('Roam Rush customer — store', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI store — Island Grill menu and back', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerStore(page);
  });
});
