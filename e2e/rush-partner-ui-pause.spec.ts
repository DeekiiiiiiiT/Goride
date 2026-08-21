import { test } from '@playwright/test';
import { signInPartner, pauseThenResumeOrders } from './helpers/rush-partner';

/** Partner UI — pause then resume (leaves store open). Run: pnpm test:e2e:rush:partner:pause */
test('Partner UI pause — pause then resume orders', async ({ page }) => {
  await signInPartner(page);
  await pauseThenResumeOrders(page);
});
