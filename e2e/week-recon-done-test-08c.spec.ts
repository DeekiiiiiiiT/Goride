/** Done-test 8c (WRA-32): a viewer (no recon.prepare / recon.approve) sees no change buttons. */
import { expect, test } from '@playwright/test';
import { blockLiveSupabase, openWeekStep, requireLocalRun, seedPlan, signInAs } from './helpers/weekReconDoneTest';

test('done-test 8c: viewer sees the Close step but no Close, Reopen or Sign buttons', async ({ page }) => {
  requireLocalRun();
  const plan = seedPlan();
  const live: string[] = [];
  blockLiveSupabase(page, live);
  await signInAs(page, 'viewer');
  await openWeekStep(page, plan.viewerClose, 'close');
  await expect(page.getByTestId('recon-locked-step').or(page.getByTestId('recon-close-step'))).toBeVisible();
  await expect(page.getByTestId('recon-close-week')).toHaveCount(0);
  await expect(page.getByTestId('recon-reopen')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /\bSign\b(?! out)/i })).toHaveCount(0);

  // /close-week lands on the same step.
  await page.goto('/close-week');
  await expect(page).toHaveURL(/\/week-reconciliation\?.*step=close/);
  expect(live).toEqual([]);
});
