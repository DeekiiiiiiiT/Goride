/** Done-test 1 (WRA-13/14): every ended week is listed; none disappear. */
import { expect, test } from '@playwright/test';
import { blockLiveSupabase, openWeekList, requireLocalRun, seedPlan, signInAs } from './helpers/weekReconDoneTest';

test('done-test 1: all 20 ended weeks are listed (19 Outstanding + the clean-up week under Reconciled)', async ({ page }) => {
  requireLocalRun();
  const plan = seedPlan();
  const live: string[] = [];
  blockLiveSupabase(page, live);
  await signInAs(page, 'owner');
  await openWeekList(page);

  const open = plan.allWeeks.filter((w) => w !== plan.legacy);
  for (let i = 0; i < 5 && (await page.getByRole('button', { name: /Load older weeks/i }).count()) > 0; i++) {
    await page.getByRole('button', { name: /Load older weeks/i }).click();
  }
  for (const week of open) {
    await expect(page.getByTestId(`recon-week-${week}`), `week ${week} is listed`).toBeVisible();
  }
  await expect(page.getByText(`Showing ${open.length} of ${open.length} weeks`)).toBeVisible();

  await page.getByTestId('recon-tab-completed').click();
  await expect(page.getByTestId(`recon-week-${plan.legacy}`)).toBeVisible();
  expect(live, 'no call reached the hosted database').toEqual([]);
});
