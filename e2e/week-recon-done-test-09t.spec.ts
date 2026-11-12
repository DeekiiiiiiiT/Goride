/**
 * Done-test 9 on Tolls (WRA-27): two tabs on the same week's Tolls step. Tab A charges one
 * Personal toll to the driver (one `lane_change:` history row). Tab B, still on the old
 * week, charges the other one: it is refused with "This week changed" and nothing is saved
 * until it reloads. Runs in phase 2 (needs the calculator for the toll desk).
 */
import { expect, test } from '@playwright/test';
import {
  blockLiveSupabase, importTolls, openWeekStep, queryDb, requireLocalRun, runIdFor, seedPlan, signInAs, walkWeekToTolls,
} from './helpers/weekReconDoneTest';

const DRIVER = { vehicleId: 'WR0001', driverId: 'wr-driver-1', driverName: 'Test Driver One' };

function laneChanges(runId: string): number {
  return Number(queryDb(`SELECT count(*)::text FROM recon.run_events WHERE run_id = '${runId}' AND kind LIKE 'lane_change:%'`)) || 0;
}

test('done-test 9t: two tabs on Tolls — tab B sees "This week changed" and saves nothing', async ({ browser }) => {
  requireLocalRun();
  const plan = seedPlan();
  const week = plan.allWeeks[plan.allWeeks.length - 1 - 7];
  const runId = runIdFor(plan.org, week);
  const day = (n: number) => new Date(Date.parse(`${week}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

  await walkWeekToTolls('owner', week);
  // No trips this week, so both night-time tolls land in Personal use.
  await importTolls('owner', week, [
    { date: day(1), time: '03:10:00', ref: `WR9T-A-${week}`, ...DRIVER },
    { date: day(2), time: '03:20:00', ref: `WR9T-B-${week}`, ...DRIVER },
  ]);

  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  const live: string[] = [];
  blockLiveSupabase(a, live);
  blockLiveSupabase(b, live);
  await signInAs(a, 'owner');
  await signInAs(b, 'owner');
  await openWeekStep(a, week, 'tolls');
  await openWeekStep(b, week, 'tolls');

  const personalA = a.getByTestId('recon-toll-section-personal-use');
  const personalB = b.getByTestId('recon-toll-section-personal-use');
  await expect(personalA).toContainText('2 to decide', { timeout: 60_000 });
  await expect(personalB).toContainText('2 to decide', { timeout: 60_000 });

  const before = laneChanges(runId);
  await personalA.getByRole('button', { name: 'Charge Driver' }).first().click();
  await expect.poll(() => laneChanges(runId), { timeout: 30_000 }).toBe(before + 1);
  expect(Number(queryDb(`SELECT count(*)::text FROM recon.run_events WHERE run_id = '${runId}' AND kind = 'change_failed'`)), 'tab A really saved').toBe(0);

  // Tab B still holds the old week version: its change is refused.
  await personalB.getByRole('button', { name: 'Charge Driver' }).last().click();
  await expect(b.getByTestId('recon-week-changed')).toBeVisible({ timeout: 30_000 });
  await expect(b.getByTestId('recon-week-changed')).toContainText('This week changed');
  expect(laneChanges(runId), 'nothing saved from tab B').toBe(before + 1);

  await b.getByRole('button', { name: 'Reload week' }).click();
  await expect(b.getByTestId('recon-week-changed')).toHaveCount(0);
  await expect(b.getByTestId('recon-toll-section-personal-use')).toContainText('1 to decide', { timeout: 60_000 });
  expect(live).toEqual([]);
  await ctx.close();
});
