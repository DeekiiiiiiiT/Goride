import { test } from '@playwright/test';
import { signInPartner, smokePartnerDashboard } from './helpers/rush-partner';

/** Partner UI — dashboard snapshot + quick actions. Run: pnpm test:e2e:rush:partner:dashboard */
test('Partner UI dashboard — snapshot and quick actions', async ({ page }) => {
  await signInPartner(page);
  await smokePartnerDashboard(page);
});
