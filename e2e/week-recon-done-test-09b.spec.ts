/**
 * Done-test 9b (WRA-27): the Tag account step open in two tabs. Tab A saves the statement
 * closing (one history row). Tab B, still on the old week, saves too: it gets
 * "This week changed" and nothing is saved until it reloads.
 * Tag Co is its own company with one toll tag (the Tag account step only shows then).
 */
import { expect, test } from '@playwright/test';
import {
  apiAs, blockLiveSupabase, historyCount, openWeekStep, requireLocalRun, runIdFor, seedPlan, signInAs, walkWeekToTolls,
} from './helpers/weekReconDoneTest';

test('done-test 9b: two tabs on Tag account — the second Save gets "This week changed"', async ({ browser }) => {
  requireLocalRun();
  const plan = seedPlan();
  const week = plan.tagWeek;
  const runId = runIdFor(plan.tagOrg, week);
  const path = `/fleet-core/recon/runs/rideshare/${week}`;

  // Bring the week to Tag account: files marked "no activity", Tolls finished and completed.
  await walkWeekToTolls('tagco', week);
  const finish = await apiAs('tagco', 'POST', `/fleet-toll/toll-reconciliation/periods/${week}/finish`, {});
  expect(finish.status, `toll finish: ${JSON.stringify(finish.body)}`).toBeLessThan(300);
  const desk = (await apiAs('tagco', 'GET', path)).body;
  const tolls = desk.evaluation.steps.find((s: { id: string }) => s.id === 'tolls');
  if (tolls && !tolls.hidden && tolls.status !== 'complete') {
    const r = await apiAs('tagco', 'POST', `${path}/steps/tolls/complete`, { expectedVersion: Number(desk.run.version) }, { 'Idempotency-Key': crypto.randomUUID() });
    expect(r.status, `complete tolls: ${JSON.stringify(r.body)}`).toBeLessThan(300);
  }

  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const live: string[] = [];
  blockLiveSupabase(a, live);
  blockLiveSupabase(b, live);
  await signInAs(a, 'tagco');
  await signInAs(b, 'tagco');
  await openWeekStep(a, week, 'tag_account');
  await openWeekStep(b, week, 'tag_account');
  await expect(a.getByLabel('Statement closing balance')).toBeVisible({ timeout: 60_000 });
  await expect(b.getByLabel('Statement closing balance')).toBeVisible({ timeout: 60_000 });

  const before = historyCount(runId, 'tag_account_statement_closing');
  await a.getByLabel('Statement closing balance').fill('0');
  await a.getByRole('button', { name: 'Save closing' }).click();
  await expect.poll(() => historyCount(runId, 'tag_account_statement_closing'), { timeout: 30_000 }).toBe(before + 1);
  expect(historyCount(runId, 'change_failed'), 'tab A really saved').toBe(0);

  // Tab B still holds the old week version: its Save is refused.
  await b.getByLabel('Statement closing balance').fill('10');
  await b.getByRole('button', { name: 'Save closing' }).click();
  await expect(b.getByTestId('recon-week-changed')).toBeVisible({ timeout: 30_000 });
  await expect(b.getByTestId('recon-week-changed')).toContainText('This week changed');
  expect(historyCount(runId, 'tag_account_statement_closing'), 'nothing saved from tab B').toBe(before + 1);

  await b.getByRole('button', { name: 'Reload week' }).click();
  await expect(b.getByTestId('recon-week-changed')).toHaveCount(0);
  expect(live).toEqual([]);
  await ctx.close();
});
