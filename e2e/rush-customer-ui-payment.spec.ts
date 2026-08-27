import { test } from '@playwright/test';
import { resetCustomerStorage, signInCustomer, smokeCustomerPayment } from './helpers/rush-customer';

/** Customer UI — Payment Methods. Run: pnpm test:e2e:rush:customer:payment */
test.describe('Roam Rush customer — payment', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI payment — WiPay and Cash options', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerPayment(page);
  });
});
