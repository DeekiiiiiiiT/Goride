/** Done-test 8a (WRA-32/38): the accountant sends Close for approval; the manager approves from the bell. */
import { expect, test } from '@playwright/test';
import { closablePlan, openWeekStep, pageAs, requireLocalRun, seedPlan, startClose, weekState } from './helpers/weekReconDoneTest';

test('done-test 8a: Send for approval → Approve from the bell → closed, "Prepared by … · Approved by …"', async ({ browser }) => {
  requireLocalRun();
  const plan = seedPlan();
  const week = closablePlan()[0];
  const live: string[] = [];

  const acc = await pageAs(browser, 'accountant', live);
  await startClose(acc.page, week);
  await acc.page.getByTestId('recon-approval-send').click();
  await acc.page.getByTestId('recon-approval-reason').fill('All files marked no activity; ready to close.');
  await acc.page.getByTestId('recon-approval-submit').click();
  await expect(acc.page.getByTestId('recon-approval-waiting')).toBeVisible();

  const mgr = await pageAs(browser, 'manager', live);
  await mgr.page.goto('/');
  await mgr.page.getByTestId('recon-bell').click();
  const item = mgr.page.getByTestId('recon-bell-to_approve').first();
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Approve' }).click();

  await expect.poll(() => weekState(plan.org, week), { timeout: 120_000 }).toBe('closed');
  await openWeekStep(mgr.page, week, 'close');
  await expect(mgr.page.getByTestId('recon-closed-badge')).toBeVisible();
  await expect(mgr.page.getByTestId('recon-history')).toContainText(/Prepared by WR Done Accountant · Approved by WR Done Manager/);
  expect(live).toEqual([]);
  await acc.ctx.close();
  await mgr.ctx.close();
});
