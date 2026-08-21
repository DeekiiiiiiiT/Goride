import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerHome } from './helpers/rush-customer';

/** Customer UI — home discovery. Run: pnpm test:e2e:rush:customer:home */
test.describe('Roam Rush customer — home', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI home — address chip verticals and Popular near you', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerHome(page);
  });
});
