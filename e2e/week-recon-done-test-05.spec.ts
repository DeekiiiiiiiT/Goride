/**
 * Done-test 5 (WRA-01): Tolls inside the step. In Upload Co's week (trips from done-test 3),
 * one toll 20 minutes before a pickup lands in Deadhead and one with no trip near lands in
 * Personal use; decide both, clear the platform's unlinked refunds, then Seal tolls. The step
 * rail shows Tolls complete, and no second stepper or toll "Close Week" button appears.
 * Runs after done-test 3 (same phase) — it needs that week's trips.
 */
import { expect, test } from '@playwright/test';
import { importTolls, openWeekStep, pageAs, requireLocalRun, seedPlan, walkWeekToTolls } from './helpers/weekReconDoneTest';

const KENNY = { vehicleId: '5179KZ', driverId: '52ff47da-ef48-41b8-93d5-80a09b85ce5b', driverName: 'Kenny Gregory Rattray' };

test('done-test 5: decide a Deadhead and a Personal toll, clear refunds, Seal tolls → Tolls complete', async ({ browser }) => {
  requireLocalRun();
  const plan = seedPlan();
  const week = plan.uploadWeek;
  const live: string[] = [];

  await walkWeekToTolls('uploader', week);
  // Uber trip times are UTC; toll times are Jamaica wall clock (UTC−5).
  // Pickup 2026-03-18 14:55 UTC = 09:55 in Jamaica → a 09:35 toll is Deadhead.
  await importTolls('uploader', week, [
    { date: '2026-03-18', time: '09:35:00', ref: 'WR5-DEADHEAD', ...KENNY },
    { date: '2026-03-19', time: '04:10:00', ref: 'WR5-PERSONAL', ...KENNY },
  ]);

  const up = await pageAs(browser, 'uploader', live);
  await openWeekStep(up.page, week, 'tolls');
  const panel = up.page.getByTestId('recon-tolls-panel');
  await expect(panel).toBeVisible({ timeout: 60_000 });

  const deadhead = up.page.getByTestId('recon-toll-section-deadhead');
  await expect(deadhead).toContainText('Mar 18, 9:35 AM');
  await deadhead.getByRole('button', { name: 'Confirm Deadhead' }).first().click();
  await expect(deadhead).not.toContainText('Mar 18, 9:35 AM', { timeout: 30_000 });
  await expect(deadhead).not.toContainText(/\d+ to decide/);

  const personal = up.page.getByTestId('recon-toll-section-personal-use');
  await expect(personal).toContainText('Mar 19, 4:10 AM');
  await personal.getByRole('button', { name: 'Charge Driver' }).first().click();
  await expect(personal).not.toContainText('Mar 19, 4:10 AM', { timeout: 30_000 });
  await expect(personal).not.toContainText(/\d+ to decide/);

  // The sample Uber files carry toll credits with no linked toll: clear each as a cash wash.
  const refunds = up.page.getByTestId('recon-toll-section-unlinked-refunds');
  for (let i = 0; i < 10 && (await refunds.getByRole('button', { name: 'Review' }).count()) > 0; i++) {
    await refunds.getByRole('button', { name: 'Review' }).first().click();
    const dlg = up.page.getByRole('dialog').last();
    await dlg.getByRole('button', { name: /^Cash wash/ }).click();
    await dlg.getByRole('button', { name: 'Resolve with selected' }).click();
    await expect(dlg).toBeHidden({ timeout: 30_000 });
  }

  const seal = up.page.getByTestId('recon-seal-tolls');
  await expect(seal).toBeEnabled({ timeout: 60_000 });
  await seal.click();
  await expect(up.page.getByTestId('recon-step-tolls')).toContainText(/Complete|Tolls locked/, { timeout: 60_000 });

  // One stepper only (the week's), and no toll "Close Week" button anywhere.
  await expect(up.page.getByRole('button', { name: /^Close Week$/ })).toHaveCount(0);
  await expect(up.page.getByText(/^Step \d+ of \d+$/)).toHaveCount(1);
  expect(live).toEqual([]);
  await up.ctx.close();
});
