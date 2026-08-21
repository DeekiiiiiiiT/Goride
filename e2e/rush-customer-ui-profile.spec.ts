import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerProfile } from './helpers/rush-customer';

/** Customer UI — Edit Profile. Run: pnpm test:e2e:rush:customer:profile */
test.describe('Roam Rush customer — profile', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI profile — Edit Profile fields without save', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerProfile(page);
  });
});
