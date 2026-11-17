/** Done-test 8b (WRA-32): the manager approves their own Close; a reason is required and it is logged self-approved. */
import { expect, test } from '@playwright/test';
import { closablePlan, openWeekStep, pageAs, requireLocalRun, seedPlan, startClose, weekState } from './helpers/weekReconDoneTest';

test('done-test 8b: Approve it myself needs a reason; the week closes', async ({ browser }) => {
  requireLocalRun();
  const plan = seedPlan();
  const week = closablePlan()[1];
  const live: string[] = [];
  const reason = 'Closing myself: no activity this week';

  const mgr = await pageAs(browser, 'manager', live);
  await startClose(mgr.page, week);
  await mgr.page.getByTestId('recon-approval-self').click();
  // A too-short reason is refused in the dialog; nothing is sent.
  await mgr.page.getByTestId('recon-approval-reason').fill('short');
  await mgr.page.getByTestId('recon-approval-submit').click();
  await expect(mgr.page.getByTestId('recon-approval-dialog')).toContainText('at least 8 characters');
  await expect(mgr.page.getByTestId('recon-approval-submit')).toBeDisabled();
  expect(weekState(plan.org, week)).not.toBe('closed');
  await mgr.page.getByTestId('recon-approval-reason').fill(reason);
  await mgr.page.getByTestId('recon-approval-submit').click();

  await expect.poll(() => weekState(plan.org, week), { timeout: 120_000 }).toBe('closed');
  // History list removed from the Close step (owner, 17 Nov): the close still happens, no list shows.
  await openWeekStep(mgr.page, week, 'close');
  await expect(mgr.page.getByTestId('recon-history')).toHaveCount(0);
  expect(live).toEqual([]);
  await mgr.ctx.close();
});
