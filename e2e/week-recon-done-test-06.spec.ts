/**
 * Done-test 6 (WRA-01, WRA-17): Fuel inside the step. Upload Co's week of 23 Mar (its own
 * week: files marked "no activity", Tolls finished with nothing to decide) has one fill for
 * car 5179KZ with a critical fuel check. Resolve it in step 5, then Finalize fuel: Fuel turns
 * complete only after Finalize, never on its own. Phase 2 (calculator running).
 */
import { expect, test } from '@playwright/test';
import { apiAs, execDb, openWeekStep, pageAs, requireLocalRun, seedPlan, walkWeekToTolls } from './helpers/weekReconDoneTest';

const KENNY = '52ff47da-ef48-41b8-93d5-80a09b85ce5b';
const WEEK = '2026-03-23';

function seedFlaggedFill(org: string, date: string) {
  const id = 'wr6-fill-1';
  const payload = {
    id, organizationId: org, date, time: '10:15:00', vehicleId: '5179KZ', driverId: KENNY, driverName: 'Kenny Gregory Rattray',
    amount: 6200, liters: 31, pricePerLiter: 200, odometer: 152400, type: 'Manual_Entry', entryMode: 'Anchor',
    paymentSource: 'Personal', serviceLine: 'rideshare', location: 'Done-test station',
    metadata: { integrityStatus: 'critical', anomalyReason: 'Tank overfill', signalTier: 'exception' },
  };
  const json = JSON.stringify(payload).replace(/'/g, "''");
  execDb(`
    INSERT INTO fleet.fuel_entries (id, organization_id, date, vehicle_id, driver_id, amount, liters, type, entry_mode, payment_source,
      legacy_kv_id, payload_json, odometer, service_line, service_line_source)
    VALUES ('${id}', '${org}', DATE '${date}', '5179KZ', '${KENNY}', 6200, 31, 'Manual_Entry', 'Anchor', 'Personal',
      'fuel_entry:${id}', '${json}'::jsonb, 152400, 'rideshare', 'explicit')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.kv_store_37f42386 (key, value) VALUES ('fuel_entry:${id}', '${json}'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `);
}

test('done-test 6: resolve a fuel check, then Finalize fuel → Fuel complete only after Finalize', async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  requireLocalRun();
  const plan = seedPlan();
  const week = WEEK;
  const live: string[] = [];
  seedFlaggedFill(plan.uploadOrg, '2026-03-25');

  // Bring the week to Fuel: files "no activity", then Tolls finished (no tolls) and completed.
  await walkWeekToTolls('uploader', week);
  const finish = await apiAs('uploader', 'POST', `/fleet-toll/toll-reconciliation/periods/${week}/finish`, {});
  expect(finish.status, `toll finish: ${JSON.stringify(finish.body)}`).toBeLessThan(300);
  const path = `/fleet-core/recon/runs/rideshare/${week}`;
  const desk = (await apiAs('uploader', 'GET', path)).body;
  const tolls = desk.evaluation.steps.find((x: { id: string }) => x.id === 'tolls');
  if (tolls && !tolls.hidden && tolls.status !== 'complete') {
    const r = await apiAs('uploader', 'POST', `${path}/steps/tolls/complete`, { expectedVersion: Number(desk.run.version) }, { 'Idempotency-Key': crypto.randomUUID() });
    expect(r.status, `complete tolls: ${JSON.stringify(r.body)}`).toBeLessThan(300);
  }

  const up = await pageAs(browser, 'uploader', live);
  await openWeekStep(up.page, week, 'fuel');
  const panel = up.page.getByTestId('recon-fuel-panel');
  await expect(panel).toBeVisible({ timeout: 60_000 });

  const checks = up.page.getByTestId('recon-fuel-section-checks');
  await expect(checks).toContainText('1 to fix', { timeout: 60_000 });
  // Not complete on its own, and Finalize stays off while the check is open.
  await expect(up.page.getByTestId('recon-step-fuel')).not.toContainText(/Complete|Fuel locked/);
  await expect(up.page.getByTestId('recon-finalize-fuel')).toBeDisabled();

  await checks.getByRole('button', { name: 'Resolve' }).first().click();
  const dlg = up.page.getByRole('dialog').last();
  await dlg.locator('#exception-resolve-note').fill('Reviewed with the driver — the fill is right');
  await dlg.getByRole('button', { name: /Looks correct/ }).click();
  await expect(dlg).toBeHidden({ timeout: 30_000 });
  await expect(checks).toContainText('Clear', { timeout: 60_000 });

  // Still not complete until Finalize is pressed.
  await expect(up.page.getByTestId('recon-step-fuel')).not.toContainText(/Complete|Fuel locked/);
  const finalize = up.page.getByTestId('recon-finalize-fuel');
  await expect(finalize).toBeEnabled({ timeout: 60_000 });
  await finalize.click();
  const confirm = up.page.getByRole('dialog').last();
  if (await confirm.isVisible().catch(() => false)) {
    const go = confirm.getByRole('button', { name: /Finalize/ });
    if (await go.count()) await go.first().click();
  }
  await expect(up.page.getByTestId('recon-step-fuel')).toContainText(/Complete|Fuel locked/, { timeout: 60_000 });
  expect(live).toEqual([]);
  await up.ctx.close();
});
