import { test } from '@playwright/test';
import { signInPartner, smokePartnerAccountRow } from './helpers/rush-partner';

/** Partner UI — Team Members only. Run: pnpm test:e2e:rush:partner:team */
test('Partner UI team — Team Members row', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerAccountRow(page, 'Team Members');
});
