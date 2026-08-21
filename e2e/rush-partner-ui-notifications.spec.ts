import { test } from '@playwright/test';
import { signInPartner, smokePartnerAccountRow } from './helpers/rush-partner';

/** Partner UI — Notification Settings only. Run: pnpm test:e2e:rush:partner:notifications */
test('Partner UI notifications — Notification Settings row', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerAccountRow(page, 'Notification Settings');
});
