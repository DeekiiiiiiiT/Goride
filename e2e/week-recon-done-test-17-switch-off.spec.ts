/** recon_v2 switch (audit §9): a company with the switch off keeps the old close path. */
import { expect, test } from '@playwright/test';
import { blockLiveSupabase, requireLocalRun, signInAs } from './helpers/weekReconDoneTest';

test('switch off: no Week Reconciliation in the menu; its link opens Driver Settlements', async ({ page }) => {
  requireLocalRun();
  const live: string[] = [];
  blockLiveSupabase(page, live);
  await signInAs(page, 'switchOff');
  await page.goto('/');
  await page.getByText('Loading application…').waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  await expect(page.getByRole('link', { name: 'Week Reconciliation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Week Reconciliation' })).toHaveCount(0);
  await page.goto('/week-reconciliation');
  await page.getByText('Loading application…').waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  await expect(page.getByTestId('recon-week-list')).toHaveCount(0);
  await expect(page).toHaveURL(/driver-settlements|close-week/);
  expect(live).toEqual([]);
});
