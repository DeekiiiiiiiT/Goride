/**
 * Done-test 3 (WRA-05/09): upload the Uber weekly files for week W inside Week Reconciliation;
 * Uber shows "received" (not "partial") once the calculator has run, and the upload covers
 * exactly Monday–Sunday of W. Uses the real sample Uber files (week of 16 Mar 2026) in
 * Upload Co, its own test company.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { openWeekStep, pageAs, queryDb, requireLocalRun, seedPlan } from './helpers/weekReconDoneTest';

const SAMPLE = join(process.cwd(), 'apps', 'fleet', 'src', 'fixtures', 'golden-import-bundle-march16-23');

test('done-test 3: an Uber upload makes Uber "received" for exactly that week', async ({ browser }) => {
  requireLocalRun();
  const plan = seedPlan();
  const week = plan.uploadWeek;
  const live: string[] = [];

  const up = await pageAs(browser, 'uploader', live);
  await openWeekStep(up.page, week, 'sources');
  const card = up.page.getByTestId('recon-source-uber_bundle');
  await expect(card).toContainText(/missing/i);
  await card.getByRole('button', { name: /^Upload$/ }).click();

  const dialog = up.page.getByTestId('close-week-uber-reimport');
  await expect(dialog).toBeVisible();
  const files = readdirSync(SAMPLE).filter((f) => f.endsWith('.csv')).map((f) => join(SAMPLE, f));
  await dialog.locator('input[type="file"]').setInputFiles(files);
  const save = dialog.getByRole('button', { name: 'Save cash refresh' });
  await expect(save).toBeEnabled({ timeout: 60_000 });
  await save.click();
  await expect(dialog).toBeHidden({ timeout: 120_000 });

  // Exactly one completed Uber upload for the week, covering Monday–Sunday.
  await expect
    .poll(() => queryDb(`
      SELECT coverage_start::text || '|' || coverage_end::text || '|' || array_to_string(week_keys, ',')
      FROM fleet.import_batches
      WHERE organization_id = '${plan.uploadOrg}' AND source_id = 'uber_bundle' AND status = 'completed'
        AND week_keys @> ARRAY['${week}']::date[]`), { timeout: 60_000 })
    .toBe(`${week}|2026-03-22|${week}`);

  // After the calculator runs, the week says "received", never "partial".
  await expect
    .poll(async () => {
      await up.page.reload();
      await expect(up.page.getByTestId('recon-week-desk')).toBeVisible({ timeout: 60_000 });
      return (await up.page.getByTestId('recon-source-uber_bundle').innerText()).toLowerCase();
    }, { timeout: 180_000, intervals: [5_000] })
    .toContain('received');
  await expect(up.page.getByTestId('recon-source-uber_bundle')).not.toContainText(/partial/i);
  expect(live).toEqual([]);
  await up.ctx.close();
});
