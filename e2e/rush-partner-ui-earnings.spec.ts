import { test } from '@playwright/test';
import { signInPartner, smokePartnerEarnings } from './helpers/rush-partner';

/** Partner UI — earnings via drawer / revenue. Run: pnpm test:e2e:rush:partner:earnings */
test('Partner UI earnings — drawer or revenue deep-link', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerEarnings(page);
});
