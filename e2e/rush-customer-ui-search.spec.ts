import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerSearch } from './helpers/rush-customer';

/** Customer UI — search tab. Run: pnpm test:e2e:rush:customer:search */
test.describe('Roam Rush customer — search', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI search — craving UI browse and query', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerSearch(page);
  });
});
