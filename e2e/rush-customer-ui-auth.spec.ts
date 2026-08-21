import { expect, test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer } from './helpers/rush-customer';

/** Customer UI — login lands on home. Run: pnpm test:e2e:rush:customer:auth */
test.describe('Roam Rush customer — auth', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI auth — login lands on Popular near you', async ({ page }) => {
    await signInCustomer(page);
    await expect(page.getByRole('heading', { name: 'Popular near you' })).toBeVisible();
  });
});
