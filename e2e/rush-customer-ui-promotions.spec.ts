import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerPromotions } from './helpers/rush-customer';

/** Customer UI — Promotions. Run: pnpm test:e2e:rush:customer:promotions */
test.describe('Roam Rush customer — promotions', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI promotions — promo code field', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerPromotions(page);
  });
});
