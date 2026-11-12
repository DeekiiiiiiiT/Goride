/** Done-test 4k (WRA-11): a week closed by the old clean-up shows no Reopen; the server refuses one too. */
import { expect, test } from '@playwright/test';
import { blockLiveSupabase, openWeekStep, requireLocalRun, seedPlan, signInAs } from './helpers/weekReconDoneTest';

test('done-test 4k: no Reopen on a clean-up week', async ({ page }) => {
  requireLocalRun();
  const plan = seedPlan();
  const live: string[] = [];
  blockLiveSupabase(page, live);
  await signInAs(page, 'owner');
  await openWeekStep(page, plan.legacy, 'close');
  await expect(page.getByTestId('recon-closed-badge')).toBeVisible();
  await expect(page.getByTestId('recon-reopen')).toHaveCount(0);

  const res = await page.evaluate(async ({ base, week }) => {
    const raw = Object.keys(localStorage).map((k) => localStorage.getItem(k)).find((v) => v && v.includes('access_token'));
    const token = raw ? JSON.parse(raw).access_token : '';
    const r = await fetch(`${base}/functions/v1/fleet-core/settlements/week-close/reopen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekKey: week, serviceLine: 'rideshare', reason: 'done-test 4k direct reopen' }),
    });
    return { status: r.status, body: await r.text() };
  }, { base: process.env.WEEK_RECON_SUPABASE_URL!, week: plan.legacy });
  expect(res.body).toContain('LEGACY_CLOSED');
  expect(live).toEqual([]);
});
