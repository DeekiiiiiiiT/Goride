import { test } from '@playwright/test';
import { signInPartner, smokePartnerAccountRow } from './helpers/rush-partner';

/** Partner UI — Edit Profile / delivery settings. Run: pnpm test:e2e:rush:partner:settings */
test('Partner UI settings — Edit Profile + Delivery Settings', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerAccountRow(page, 'Edit Profile');
  await smokePartnerAccountRow(page, 'Delivery Settings');
});
