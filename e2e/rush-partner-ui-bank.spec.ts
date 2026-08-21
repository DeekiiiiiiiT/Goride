import { test } from '@playwright/test';
import { signInPartner, smokePartnerAccountRow } from './helpers/rush-partner';

/** Partner UI — Bank & Payouts (read). Run: pnpm test:e2e:rush:partner:bank */
test('Partner UI bank — Bank & Payouts row', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerAccountRow(page, 'Bank & Payouts');
});
