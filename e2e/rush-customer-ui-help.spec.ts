import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerHelp } from './helpers/rush-customer';

/** Customer UI — Help. Run: pnpm test:e2e:rush:customer:help */
test.describe('Roam Rush customer — help', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI help — How can we help quick actions', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerHelp(page);
  });
});
