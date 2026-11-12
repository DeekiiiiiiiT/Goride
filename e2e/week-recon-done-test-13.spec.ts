/**
 * Done-test 13 (WRA-27): your own clicks never conflict. Decide 12 Personal tolls in a row
 * while the calculator runs: no "This week changed" appears, and exactly one calculator
 * publish follows, about 45 s after the last click (none between the clicks).
 * Runs in phase 2 (the local calculator loop is running).
 */
import { expect, test } from '@playwright/test';
import {
  blockLiveSupabase, importTolls, openWeekStep, queryDb, requireLocalRun, runIdFor, seedPlan, signInAs, walkWeekToTolls,
} from './helpers/weekReconDoneTest';

const DRIVER = { vehicleId: 'WR0001', driverId: 'wr-driver-1', driverName: 'Test Driver One' };

function publishes(runId: string, afterIso: string): string[] {
  const out = queryDb(
    `SELECT coalesce(string_agg(extract(epoch from at)::text, '|' ORDER BY at), '') FROM recon.run_events
      WHERE run_id = '${runId}' AND kind = 'calculator_publish' AND at > '${afterIso}'::timestamptz`,
  );
  return out ? out.split('|') : [];
}

test('done-test 13: 12 Charge Driver clicks in a row — no conflict, one publish ~45 s after', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  requireLocalRun();
  const plan = seedPlan();
  const week = plan.allWeeks[plan.allWeeks.length - 1 - 8];
  const runId = runIdFor(plan.org, week);
  const day = (n: number) => new Date(Date.parse(`${week}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

  await walkWeekToTolls('owner', week);
  // No trips this week: 12 night-time tolls, all Personal use.
  await importTolls('owner', week, Array.from({ length: 12 }, (_, i) => ({
    date: day(i % 7), time: `0${2 + Math.floor(i / 7)}:${String(10 + i * 3).padStart(2, '0')}:00`, ref: `WR13-${i}-${week}`, ...DRIVER,
  })));

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const live: string[] = [];
  blockLiveSupabase(page, live);
  await signInAs(page, 'owner');
  await openWeekStep(page, week, 'tolls');
  const personal = page.getByTestId('recon-toll-section-personal-use');
  await expect(personal).toContainText('12 to decide', { timeout: 60_000 });

  const start = queryDb(`SELECT now()::text`);
  for (let left = 12; left > 0; left--) {
    await personal.getByRole('button', { name: 'Charge Driver' }).first().click();
    if (left > 1) await expect(personal).toContainText(`${left - 1} to decide`, { timeout: 30_000 });
    await expect(page.getByTestId('recon-week-changed')).toHaveCount(0);
  }
  await expect(personal).not.toContainText(/\d+ to decide/, { timeout: 30_000 });
  const lastClick = Number(queryDb(`SELECT extract(epoch from now())::text`));
  expect(publishes(runId, start), 'no publish between the clicks').toEqual([]);

  // One publish after the quiet period (45 s), well before the 15-minute cap.
  await expect.poll(() => publishes(runId, start).length, { timeout: 4 * 60_000, intervals: [5_000] }).toBe(1);
  const [at] = publishes(runId, start);
  const gapS = Number(at) - lastClick;
  expect(gapS, `publish ${gapS}s after the last click`).toBeGreaterThanOrEqual(40);
  await page.waitForTimeout(20_000);
  expect(publishes(runId, start), 'still exactly one publish').toHaveLength(1);
  await expect(page.getByTestId('recon-week-changed')).toHaveCount(0);
  expect(live).toEqual([]);
  await ctx.close();
});
