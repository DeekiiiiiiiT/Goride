import { test } from '@playwright/test';
import { signInPartner, smokePartnerAnalytics } from './helpers/rush-partner';

/** Partner UI — analytics tab. Run: pnpm test:e2e:rush:partner:analytics */
test('Partner UI analytics — tab loads', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerAnalytics(page);
});
