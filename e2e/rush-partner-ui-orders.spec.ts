import { test } from '@playwright/test';
import { signInPartner, smokePartnerOrders } from './helpers/rush-partner';

/** Partner UI — order queue + Ready detail. Run: pnpm test:e2e:rush:partner:orders */
test('Partner UI orders — queue shows latest and opens Ready detail', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerOrders(page);
});
