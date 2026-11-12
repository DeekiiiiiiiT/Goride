/** Done-test 10 (WRA-28): double-click Mark no activity → one history row. */
import { expect, test } from '@playwright/test';
import { blockLiveSupabase, historyCount, openWeekStep, requireLocalRun, runIdFor, seedPlan, signInAs } from './helpers/weekReconDoneTest';

test('done-test 10: a double-click saves once', async ({ page }) => {
  requireLocalRun();
  const plan = seedPlan();
  const runId = runIdFor(plan.org, plan.doubleClick);
  const live: string[] = [];
  blockLiveSupabase(page, live);
  await signInAs(page, 'owner');
  await openWeekStep(page, plan.doubleClick, 'sources');

  const before = historyCount(runId, 'source_attest_none');
  await page.getByRole('button', { name: /No activity on/i }).first().dblclick();
  await expect.poll(() => historyCount(runId, 'source_attest_none')).toBe(before + 1);
  await page.waitForTimeout(3000);
  expect(historyCount(runId, 'source_attest_none'), 'still one row after the second click').toBe(before + 1);
  expect(historyCount(runId, 'change_failed'), 'the save itself worked').toBe(0);
  expect(live).toEqual([]);
});
