import { test } from '@playwright/test';
import {
  resetCustomerStorage,
  signInCustomer,
  smokeCustomerAccountHub,
  smokeCustomerHeaderBell,
} from './helpers/rush-customer';

/** Customer UI — every Account row. Run: pnpm test:e2e:rush:customer:account */
test.describe('Roam Rush customer — account', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI account — every settings row + header bell', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerAccountHub(page);
    await smokeCustomerHeaderBell(page);
  });
});
