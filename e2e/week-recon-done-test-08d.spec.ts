/** Done-test 8d (WRA-38): a week change makes a pending request out of date; the sender withdraws it. */
import { expect, test } from '@playwright/test';
import { apiAs, closablePlan, openWeekStep, pageAs, requireLocalRun, runIdFor, seedPlan, startClose } from './helpers/weekReconDoneTest';

test('done-test 8d: sent → out of date → withdrawn; no Approve on an out-of-date request', async ({ browser }) => {
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

  // A third person changes the week (a toll decision on the same week and line).
  const desk = await apiAs('owner', 'GET', `/fleet-core/recon/runs/rideshare/${week}`);
  const res = await apiAs('owner', 'POST', `/fleet-toll/toll-reconciliation/periods/${week}/finish`, {}, {
    'x-recon-week': `${runIdFor(plan.org, week)}@${desk.body.run.version}`,
  });
  expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);

  // The manager's Approve is gone; it reads "out of date".
  const mgr = await pageAs(browser, 'manager', live);
  await openWeekStep(mgr.page, week, 'close');
  await expect(mgr.page.getByTestId('recon-approval-stale')).toBeVisible({ timeout: 60_000 });
  await expect(mgr.page.getByTestId('recon-approval-approve')).toHaveCount(0);

  // The sender sees "prepare again" and withdraws.
  await openWeekStep(acc.page, week, 'close');
  const stale = acc.page.getByTestId('recon-approval-stale');
  await expect(stale).toBeVisible();
  await stale.getByRole('button', { name: 'Withdraw' }).click();
  await expect(acc.page.getByTestId('recon-approval-stale')).toHaveCount(0);
  await acc.page.reload();
  const history = acc.page.getByTestId('recon-history');
  await expect(history).toContainText(/sent for approval/i);
  await expect(history).toContainText('Withdrawn');
  expect(live).toEqual([]);
  await acc.ctx.close();
  await mgr.ctx.close();
});
