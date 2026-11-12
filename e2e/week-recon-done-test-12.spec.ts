/** Done-test 12 (WRA-37): a shared link opens the right week and step in a fresh session. */
import { expect, test } from '@playwright/test';
import { blockLiveSupabase, openWeekStep, requireLocalRun, seedPlan, signInAs } from './helpers/weekReconDoneTest';

test('done-test 12: ?week=W&step=fuel lands on step 5 of week W', async ({ page }) => {
  requireLocalRun();
  const plan = seedPlan();
  const live: string[] = [];
  blockLiveSupabase(page, live);
  await signInAs(page, 'manager');
  await openWeekStep(page, plan.sharedLink, 'fuel');
  await expect(page.getByTestId('recon-step-fuel')).toHaveAttribute('aria-current', 'step');
  await expect(page).toHaveURL(new RegExp(`week=${plan.sharedLink}`));
  await expect(page).toHaveURL(/step=fuel/);
  // Fuel waits on its files in a seeded week, so it opens read-only.
  await expect(page.getByTestId('recon-locked-step')).toBeVisible();
  expect(live).toEqual([]);
});
