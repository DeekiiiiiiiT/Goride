import { test } from '@playwright/test';
import { signInPartner, smokePartnerAccountRow } from './helpers/rush-partner';

/** Partner UI — Business Hours only. Run: pnpm test:e2e:rush:partner:hours */
test('Partner UI hours — Business Hours row', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerAccountRow(page, 'Business Hours');
});
