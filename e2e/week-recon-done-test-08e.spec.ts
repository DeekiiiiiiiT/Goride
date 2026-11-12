/** Done-test 8e (WRA-38): two approvers press Approve at once — one wins, the other is told who did. */
import { expect, test } from '@playwright/test';
import { closablePlan, openWeekStep, pageAs, queryDb, requireLocalRun, runIdFor, seedPlan, startClose, weekState } from './helpers/weekReconDoneTest';

test('done-test 8e: exactly one approval runs; the other sees "Already approved by …"', async ({ browser }) => {
  requireLocalRun();
  const plan = seedPlan();
  const week = closablePlan()[2];
  const live: string[] = [];

  const acc = await pageAs(browser, 'accountant', live);
  await startClose(acc.page, week);
  await acc.page.getByTestId('recon-approval-send').click();
  await acc.page.getByTestId('recon-approval-reason').fill('Ready to close, please approve.');
  await acc.page.getByTestId('recon-approval-submit').click();
  await expect(acc.page.getByTestId('recon-approval-waiting')).toBeVisible();

  const mgr = await pageAs(browser, 'manager', live);
  const own = await pageAs(browser, 'owner', live);
  await openWeekStep(mgr.page, week, 'close');
  await openWeekStep(own.page, week, 'close');
  const a = mgr.page.getByTestId('recon-approval-approve');
  const b = own.page.getByTestId('recon-approval-approve');
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  await Promise.all([a.click(), b.click()]);

  const runId = runIdFor(plan.org, week);
  await expect
    .poll(() => Number(queryDb(`SELECT count(*)::text FROM recon.run_events WHERE run_id = '${runId}' AND kind = 'approval_approved'`)))
    .toBe(1);
  // The one who lost the race is told who got there first.
  await expect
    .poll(async () => (await mgr.page.getByText(/Already approved by WR Done/).count()) + (await own.page.getByText(/Already approved by WR Done/).count()))
    .toBe(1);
  await expect.poll(() => weekState(plan.org, week), { timeout: 120_000 }).toBe('closed');
  expect(live).toEqual([]);
  await acc.ctx.close();
  await mgr.ctx.close();
  await own.ctx.close();
});
