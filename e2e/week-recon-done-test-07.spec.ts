/** Done-test 7 (WRA-16): calculator paused → red banner on the week and Close is off. */
import { expect, test } from '@playwright/test';
import { blockLiveSupabase, openWeekStep, requireLocalRun, seedPlan, setCalculatorPaused, signInAs } from './helpers/weekReconDoneTest';

test('done-test 7: paused calculator shows the banner and turns Close off', async ({ page }) => {
  requireLocalRun();
  const plan = seedPlan();
  const live: string[] = [];
  blockLiveSupabase(page, live);
  await signInAs(page, 'owner');
  setCalculatorPaused(true);
  try {
    await openWeekStep(page, plan.paused, 'close');
    const banner = page.getByTestId('recon-calculator-banner');
    await expect(banner).toHaveAttribute('data-state', 'paused');
    await expect(banner).toContainText('Calculator paused');
    // Close is never available while paused (locked here, or disabled when open).
    await expect(page.locator('[data-testid="recon-close-week"]:enabled')).toHaveCount(0);
  } finally {
    setCalculatorPaused(false);
  }
  expect(live).toEqual([]);
});
