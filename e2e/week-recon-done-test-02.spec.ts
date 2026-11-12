/** Done-test 2 (WRA-06/07): one truth — the Close step lists exactly the saved blockers. */
import { expect, test } from '@playwright/test';
import { blockLiveSupabase, openWeekStep, queryDb, requireLocalRun, seedPlan, signInAs } from './helpers/weekReconDoneTest';

test('done-test 2: the saved blockers are the ones the Close step lists', async ({ page }) => {
  requireLocalRun();
  const plan = seedPlan();
  const live: string[] = [];
  blockLiveSupabase(page, live);
  await signInAs(page, 'owner');

  const stored = Number(queryDb(`
    SELECT count(*)::text FROM recon.week_blockers
    WHERE organization_id = '${plan.org}' AND week_key = '${plan.oneTruth}'
      AND service_line = 'rideshare' AND severity = 'block'`));
  expect(stored, 'the seed left blocking rows for this week').toBeGreaterThan(0);

  // Files are missing in the seeded week, so Close is locked and lists its problems read-only.
  await openWeekStep(page, plan.oneTruth, 'close');
  const list = page.getByTestId('recon-locked-blockers');
  await expect(list).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(stored);
  await expect(list).toContainText(`Still to fix here (${stored})`);
  await expect(list).toContainText(/fuel/i);
  await expect(page.getByTestId('recon-close-week')).toHaveCount(0);
  expect(live).toEqual([]);
});
