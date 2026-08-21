import { test } from '@playwright/test';
import {
  resetCustomerStorage,
  signInCustomer,
  smokeCustomerNotifications,
} from './helpers/rush-customer';

/** Customer UI — Notification Settings. Run: pnpm test:e2e:rush:customer:notifications */
test.describe('Roam Rush customer — notifications', () => {
  test.beforeEach(async ({ page }) => {
    await resetCustomerStorage(page);
  });

  test('Customer UI notifications — Push Notifications sections', async ({ page }) => {
    await signInCustomer(page);
    await smokeCustomerNotifications(page);
  });
});
