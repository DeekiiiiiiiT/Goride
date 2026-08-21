import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerAddresses } from './helpers/rush-customer';

/** Customer UI — Saved Addresses. Run: pnpm test:e2e:rush:customer:addresses */
test.describe('Roam Rush customer — addresses', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI addresses — Saved Addresses and Add Address without save', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerAddresses(page);
  });
});
