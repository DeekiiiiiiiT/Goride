import { test } from '@playwright/test';
import { signInPartner, smokePartnerMenu } from './helpers/rush-partner';

/** Partner UI — menu overview. Run: pnpm test:e2e:rush:partner:menu */
test('Partner UI menu — overview and open category', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerMenu(page);
});
