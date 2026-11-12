/**
 * Done-test 11 (WRA-31): the calculator has been paused for over an hour. An approver gets the
 * in-app alert, the week shows the red banner, and Close is off. The alert comes from the
 * alerts-only pass the database runs every 10 minutes while paused (Rev 24).
 */
import { expect, test } from '@playwright/test';
import {
  openWeekStep,
  pageAs,
  requireLocalRun,
  runAlertPassLocal,
  seedPlan,
  setCalculatorPausedSince,
} from './helpers/weekReconDoneTest';

test('done-test 11: paused over an hour → approver alert in the bell, banner, Close off', async ({ browser }) => {
  requireLocalRun();
  const plan = seedPlan();
  const live: string[] = [];
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 60_000).toISOString();
  setCalculatorPausedSince(true, twoHoursAgo);
  try {
    runAlertPassLocal();

    const mgr = await pageAs(browser, 'manager', live);
    await openWeekStep(mgr.page, plan.paused, 'close');
    await expect(mgr.page.getByTestId('recon-calculator-banner')).toHaveAttribute('data-state', 'paused');
    await expect(mgr.page.locator('[data-testid="recon-close-week"]:enabled')).toHaveCount(0);

    await mgr.page.getByTestId('recon-bell').click();
    const alert = mgr.page.getByTestId('recon-bell-alert').filter({ hasText: /calculator paused/i });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/2 hours/);
    await mgr.ctx.close();
  } finally {
    setCalculatorPausedSince(false, new Date().toISOString());
  }
  expect(live).toEqual([]);
});
