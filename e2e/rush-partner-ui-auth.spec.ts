import { expect, test } from '@playwright/test';
import { dismissPartnerOverlays, signInPartner } from './helpers/rush-partner';

/** Partner UI — login & Island Grill shell. Run: pnpm test:e2e:rush:partner:auth */
test('Partner UI auth — login lands on Island Grill', async ({ page }) => {
  await signInPartner(page);
  await expect(page.getByText('Island Grill').first()).toBeVisible();
  await dismissPartnerOverlays(page);
});
