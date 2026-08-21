import { test } from '@playwright/test';
import { signInPartner, smokePartnerAccountHub, smokePartnerHeaderShortcuts } from './helpers/rush-partner';

/** Partner UI — open every Account settings row. Run: pnpm test:e2e:rush:partner:account */
test('Partner UI account — every settings row + header shortcuts', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerAccountHub(page);
  await smokePartnerHeaderShortcuts(page);
});
