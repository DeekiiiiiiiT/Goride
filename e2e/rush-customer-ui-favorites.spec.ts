import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerFavorites } from './helpers/rush-customer';

/** Customer UI — Favorites. Run: pnpm test:e2e:rush:customer:favorites */
test.describe('Roam Rush customer — favorites', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI favorites — Restaurants and Items tabs', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerFavorites(page);
  });
});
