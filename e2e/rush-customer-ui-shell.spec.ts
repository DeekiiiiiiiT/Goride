import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerShell } from './helpers/rush-customer';

/** Customer UI — bottom nav round-trip. Run: pnpm test:e2e:rush:customer:shell */
test.describe('Roam Rush customer — shell', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI shell — Home Search Orders Account round-trip', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerShell(page);
  });
});
