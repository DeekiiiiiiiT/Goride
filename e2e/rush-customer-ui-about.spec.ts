import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerAbout } from './helpers/rush-customer';

/** Customer UI — About. Run: pnpm test:e2e:rush:customer:about */
test.describe('Roam Rush customer — about', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI about — Roam Rush branding', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerAbout(page);
  });
});
