import { test } from '@playwright/test';
import { signInPartner, smokePartnerAccountRow } from './helpers/rush-partner';

/** Partner UI — Promotions only. Run: pnpm test:e2e:rush:partner:promotions */
test('Partner UI promotions — Promotions & Marketing row', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerAccountRow(page, 'Promotions & Marketing');
});
