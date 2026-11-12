/** Done-test 9 (WRA-27): two tabs on the same week — the second change is refused until it reloads. */
import { expect, test } from '@playwright/test';
import { blockLiveSupabase, historyCount, openWeekStep, requireLocalRun, runIdFor, seedPlan, signInAs } from './helpers/weekReconDoneTest';

const attest = /No activity on/i;

test('done-test 9: tab B sees "This week changed" and saves nothing', async ({ browser }) => {
  requireLocalRun();
  const plan = seedPlan();
  const runId = runIdFor(plan.org, plan.twoTabs);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const live: string[] = [];
  blockLiveSupabase(a, live);
  blockLiveSupabase(b, live);
  await signInAs(a, 'owner');
  await signInAs(b, 'owner');
  await openWeekStep(a, plan.twoTabs, 'sources');
  await openWeekStep(b, plan.twoTabs, 'sources');

  const before = historyCount(runId, 'source_attest_none');
  await a.getByRole('button', { name: attest }).first().click();
  await expect.poll(() => historyCount(runId, 'source_attest_none')).toBe(before + 1);
  expect(historyCount(runId, 'change_failed'), 'tab A really saved').toBe(0);

  // Tab B still shows the old week: its change is refused.
  await b.getByRole('button', { name: attest }).nth(1).click();
  await expect(b.getByTestId('recon-week-changed')).toBeVisible();
  await expect(b.getByTestId('recon-week-changed')).toContainText('This week changed');
  expect(historyCount(runId, 'source_attest_none'), 'nothing saved from tab B').toBe(before + 1);

  await b.getByRole('button', { name: 'Reload week' }).click();
  await expect(b.getByTestId('recon-week-changed')).toHaveCount(0);
  expect(live).toEqual([]);
  await ctx.close();
});
