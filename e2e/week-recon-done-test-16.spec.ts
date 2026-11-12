/** Done-test 16 (WRA-24): a locked step opens read-only with what it waits on and a Go to button. */
import { expect, test } from '@playwright/test';
import { blockLiveSupabase, openWeekStep, requireLocalRun, seedPlan, signInAs } from './helpers/weekReconDoneTest';

test('done-test 16: Trips & earnings on a week missing Uber is read-only with Go to Upload inputs', async ({ page }) => {
  requireLocalRun();
  const plan = seedPlan();
  const live: string[] = [];
  blockLiveSupabase(page, live);
  await signInAs(page, 'owner');
  await openWeekStep(page, plan.locked, 'trips_earnings');
  const locked = page.getByTestId('recon-locked-step');
  await expect(locked).toBeVisible();
  await expect(page.getByTestId('recon-seal-earnings')).toHaveCount(0);
  await locked.getByRole('button', { name: 'Go to Upload inputs' }).click();
  await expect(page.getByTestId('recon-step-sources')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('recon-source-uber_bundle')).toBeVisible();
  expect(live).toEqual([]);
});
