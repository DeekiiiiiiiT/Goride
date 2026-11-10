/**
 * Shared Playwright steps for inventory done-tests 1–18.
 */
import { expect, type Page } from '@playwright/test';
import {
  gotoDriverCarKit,
  gotoFleetInventory,
  saveLiveScreenshot,
  INV_DONE_ORG,
} from './inventoryDoneTestCore';
import {
  balanceQty,
  execInventoryDb,
  movementCount,
  movementQtySum,
  queryInventoryDb,
  stockValueJmd,
  latestMovementId,
  driverReportCount,
  approvalStatusForItem,
  roadClearanceBlockCount,
  itemId,
  kitComplianceDailyCount,
  kitTemplateLineCount,
  vestComplianceMissingCount,
  approvalIdForItem,
  latestIntegrityAlertId,
  INV_DONE_DT09_OFFER_ID,
} from './inventoryDoneTestDb';
import {
  INV_DONE_APPROVER_EMAIL,
  INV_DONE_OWNER_EMAIL,
  INV_DONE_VIEWER_EMAIL,
  INV_DONE_VEHICLE_1,
  INV_DONE_VEHICLE_2,
  seedInventoryDriverSession,
  seedInventoryFleetSession,
} from './inventoryDoneTestAuth';
import {
  acceptDeliveryOfferAsDriver,
  assertPhaseBlocked,
  driverKitCheckAllPresent,
  inventoryDoneTestFetch,
} from './inventoryDoneTestApi';

const VEH1 = INV_DONE_VEHICLE_1;
const VEH2 = INV_DONE_VEHICLE_2;

function receiveSku(org: string, sku: string, qty: number, unitCost: number, idem: string) {
  execInventoryDb(`
    SELECT fleet.inv_receive(
      '${org}',
      '{}'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'item_id', (SELECT id FROM fleet.inv_item WHERE organization_id = '${org}' AND sku = '${sku}'),
        'location_id', (SELECT id FROM fleet.inv_location WHERE organization_id = '${org}' AND lower(code) = 'main'),
        'qty', ${qty}, 'unit_cost', ${unitCost}
      )),
      '[]'::jsonb,
      '${idem.replace(/'/g, "''")}'
    );
  `);
}

async function waitPhaseFlag(path: string, wantOk: boolean) {
  await expect.poll(
    async () => {
      const res = await inventoryDoneTestFetch(path, { method: 'GET' });
      return wantOk ? res.status !== 403 : res.status === 403;
    },
    { timeout: 45_000, intervals: [2000, 3000, 5000] },
  ).toBe(true);
}

export async function runDoneTest01(page: Page) {
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page);
  await page.getByRole('button', { name: /^Receive$/i }).first().click();
  await expect(page.getByRole('heading', { name: /Receive stock/i })).toBeVisible({ timeout: 60_000 });
  await page.locator('#in4-receive-first-item').selectOption({ label: 'Tyre pump' });
  await page.locator('#receive-line-0-qty').fill('2');
  const priceInput = page
    .locator('.grid.grid-cols-12')
    .filter({ has: page.locator('#receive-line-0-qty') })
    .locator('input[type="text"]')
    .nth(1);
  await priceInput.fill('6500');
  await saveLiveScreenshot(page, 'inventory_asset_management_receive_dialog');
  await page.getByRole('button', { name: /^Receive$/i }).last().click();
  await expect.poll(() => balanceQty(INV_DONE_ORG, 'ZZ-TEST-PUMP'), { timeout: 30_000 }).toBe(2);
  expect(stockValueJmd(INV_DONE_ORG, 'ZZ-TEST-PUMP')).toBeGreaterThanOrEqual(13000);
  expect(movementCount(INV_DONE_ORG, 'RECEIVE')).toBeGreaterThanOrEqual(1);
}

export async function runDoneTest02(page: Page) {
  receiveSku(INV_DONE_ORG, 'ZZ-TEST-PUMP', 2, 6500, 'dt02-pre');
  const before = balanceQty(INV_DONE_ORG, 'ZZ-TEST-PUMP');
  expect(before).toBe(2);
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'vehicle-kits');
  await page.getByRole('button', { name: /^Matrix$/i }).click();
  // Completion audit IV-09: a Missing cell opens the Issue dialog with that line ticked (it never posts by itself).
  await page.getByRole('button', { name: /^Missing: Tyre pump on / }).first().click();
  await expect(page.getByRole('heading', { name: /Issue to cars/i })).toBeVisible({ timeout: 30_000 });
  expect(balanceQty(INV_DONE_ORG, 'ZZ-TEST-PUMP')).toBe(2);
  await saveLiveScreenshot(page, 'inventory_asset_management_issue_dialog');
  await page.getByRole('button', { name: /^Issue 1 line$/ }).click();
  await expect.poll(() => balanceQty(INV_DONE_ORG, 'ZZ-TEST-PUMP'), { timeout: 30_000 }).toBe(1);
  expect(movementQtySum(INV_DONE_ORG, 'ISSUE')).toBeLessThanOrEqual(-1);
}

export async function runDoneTest03(page: Page) {
  receiveSku(INV_DONE_ORG, 'ZZ-TEST-PUMP', 2, 6500, 'dt03-pre');
  execInventoryDb(`
    SELECT fleet.inv_issue_to_vehicles(
      '${INV_DONE_ORG}',
      (SELECT id FROM fleet.inv_location WHERE organization_id = '${INV_DONE_ORG}' AND lower(code) = 'main'),
      jsonb_build_array(jsonb_build_object(
        'item_id', (SELECT id FROM fleet.inv_item WHERE organization_id = '${INV_DONE_ORG}' AND sku = 'ZZ-TEST-PUMP'),
        'qty', 1
      )),
      ARRAY['${VEH1}']::text[],
      true,
      false,
      'dt03-issue'
    );
  `);
  expect(balanceQty(INV_DONE_ORG, 'ZZ-TEST-PUMP')).toBe(1);
  const movId = latestMovementId(INV_DONE_ORG, 'ISSUE');
  expect(movId).not.toBe('');
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'movements');
  await page.locator(`[data-movement-id="${movId}"]`).click().catch(async () => {
    await page.getByText(/ISSUE/i).first().click();
  });
  await page.getByRole('button', { name: /Reverse/i }).first().click();
  await page.locator('select').first().selectOption({ index: 1 }).catch(() => {});
  await page.getByPlaceholder(/bill of lading|E\.g\./i).fill('Done-test 03 reversal reason');
  await page.getByRole('button', { name: /Confirm reversal/i }).click();
  await expect.poll(() => movementCount(INV_DONE_ORG, 'REVERSAL'), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => balanceQty(INV_DONE_ORG, 'ZZ-TEST-PUMP'), { timeout: 30_000 }).toBe(2);
  expect(movementCount(INV_DONE_ORG, 'ISSUE')).toBeGreaterThanOrEqual(1);
  await saveLiveScreenshot(page, 'inventory_asset_management_movements_tab');
}

export async function runDoneTest04(page: Page) {
  receiveSku(INV_DONE_ORG, 'ZZ-TEST-DASH', 1, 45998.85, 'dt04-rcv');
  const stockBefore = balanceQty(INV_DONE_ORG, 'ZZ-TEST-DASH');
  expect(stockBefore).toBe(1);
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'stock');
  await page.getByText(/Dash camera/i).first().click();
  await page.getByRole('button', { name: /Write off|Remove from stock/i }).first().click();
  await expect(page.getByRole('heading', { name: /Write off|Custody/i })).toBeVisible({ timeout: 60_000 });
  await saveLiveScreenshot(page, 'inventory_asset_management_approval_review_drawer');
  await page.getByRole('button', { name: /Submit|Confirm write-off/i }).last().click();
  await expect.poll(() => approvalStatusForItem(INV_DONE_ORG, 'ZZ-TEST-DASH'), { timeout: 30_000 }).toMatch(
    /pending|awaiting/i,
  );
  const approvalId = approvalIdForItem(INV_DONE_ORG, 'ZZ-TEST-DASH');
  expect(approvalId).not.toBe('');
  const ownerApprove = await inventoryDoneTestFetch(`/approvals/${approvalId}/approve`, {
    method: 'POST',
    email: INV_DONE_OWNER_EMAIL,
  });
  expect(ownerApprove.status).toBeGreaterThanOrEqual(400);
  await seedInventoryFleetSession(page, INV_DONE_APPROVER_EMAIL);
  await gotoFleetInventory(page, 'alerts');
  await page.getByRole('button', { name: /Review|Approve/i }).first().click();
  await page.getByRole('button', { name: /Approve write-off/i }).click();
  await expect.poll(() => balanceQty(INV_DONE_ORG, 'ZZ-TEST-DASH'), { timeout: 30_000 }).toBe(0);
  expect(balanceQty(INV_DONE_ORG, 'ZZ-TEST-DASH')).toBe(stockBefore - 1);
}

export async function runDoneTest05(page: Page) {
  const before = driverReportCount(INV_DONE_ORG, 'missing');
  await seedInventoryDriverSession(page);
  await gotoDriverCarKit(page);
  await page.getByRole('button', { name: /Report/i }).first().click();
  await page.getByRole('radio', { name: /Missing/i }).click();
  await page.getByRole('button', { name: /Attach photo/i }).click();
  await page.getByRole('button', { name: /Send report/i }).click();
  await expect.poll(() => driverReportCount(INV_DONE_ORG, 'missing'), { timeout: 60_000 }).toBe(before + 1);
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'alerts');
  await expect(page.getByText(/Warning triangle|triangle|missing/i).first()).toBeVisible({ timeout: 60_000 });
  await saveLiveScreenshot(page, 'inventory_asset_management_alerts_tab');
  await seedInventoryDriverSession(page);
  await gotoDriverCarKit(page);
  await expect(page.getByText(/Reported/i).first()).toBeVisible({ timeout: 30_000 });
}

export async function runDoneTest06(page: Page) {
  const before = driverReportCount(INV_DONE_ORG, 'missing');
  await seedInventoryDriverSession(page);
  await gotoDriverCarKit(page);
  await page.context().setOffline(true);
  await page.getByRole('button', { name: /Report/i }).first().click();
  await page.getByRole('radio', { name: /Missing/i }).click();
  await page.getByRole('button', { name: /Send report/i }).click();
  await page.waitForTimeout(2000);
  await page.context().setOffline(false);
  await expect.poll(() => driverReportCount(INV_DONE_ORG, 'missing'), { timeout: 90_000 }).toBe(before + 1);
  expect(driverReportCount(INV_DONE_ORG, 'missing')).toBe(before + 1);
  await saveLiveScreenshot(page, 'report_sent_offline_queued', false);
}

export async function runDoneTest07(page: Page) {
  execInventoryDb(`
    INSERT INTO fleet.inv_driver_report (
      organization_id, report_no, vehicle_id, item_id, issue, status, photo_paths
    )
    SELECT
      '${INV_DONE_ORG}',
      'R-DT07-' || substr(md5(random()::text), 1, 6),
      '${VEH1}',
      (SELECT id FROM fleet.inv_item WHERE organization_id = '${INV_DONE_ORG}' AND sku = 'ZZ-TEST-TRI'),
      'missing', 'sent', ARRAY['e2e/photo.jpg']
    WHERE NOT EXISTS (
      SELECT 1 FROM fleet.inv_driver_report
      WHERE organization_id = '${INV_DONE_ORG}' AND status = 'sent' AND issue = 'missing'
    );
  `);
  receiveSku(INV_DONE_ORG, 'ZZ-TEST-TRI', 1, 1200, 'dt07-fix');
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'alerts');
  await page.getByRole('button', { name: /Update|Fix|Resolve/i }).first().click();
  await page.getByRole('radio', { name: /stock/i }).click().catch(() => {});
  await page.getByRole('button', { name: /Mark fixed|Confirm/i }).click();
  await expect.poll(
    () => queryInventoryDb(`SELECT count(*)::text FROM fleet.inv_driver_report WHERE organization_id = '${INV_DONE_ORG}' AND status = 'fixed'`),
    { timeout: 60_000 },
  ).not.toBe('0');
  await seedInventoryDriverSession(page);
  await gotoDriverCarKit(page);
  await expect(page.getByText(/report fixed|Fixed/i).first()).toBeVisible({ timeout: 60_000 });
  await saveLiveScreenshot(page, 'my_car_kit_vehicle_checklist', false);
}

export async function runDoneTest08(page: Page) {
  const linesBefore = kitTemplateLineCount(INV_DONE_ORG);
  await seedInventoryFleetSession(page);
  await page.goto('/vehicle-operations/inventory?tab=vehicle-kits&kitEditor=1');
  await page.locator('.hidden.md\\:block .inventory-stitch-root').first().waitFor({ state: 'visible', timeout: 120_000 });
  await page.getByRole('button', { name: /Add equipment line/i }).click();
  await page.getByText(/Reflective vest/i).click();
  await saveLiveScreenshot(page, 'inventory_asset_management_kit_template_editor');
  await page.getByRole('button', { name: /Save as new version|Publish/i }).first().click();
  await expect(page.getByText(/Move 2 cars/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Move 2 cars/i }).click();
  await expect.poll(() => kitTemplateLineCount(INV_DONE_ORG), { timeout: 60_000 }).toBe(linesBefore + 1);
  await expect.poll(() => vestComplianceMissingCount(INV_DONE_ORG, VEH1), { timeout: 60_000 }).toBe(1);
  await expect.poll(() => vestComplianceMissingCount(INV_DONE_ORG, VEH2), { timeout: 60_000 }).toBe(1);
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'vehicle-kits');
  await page.getByRole('button', { name: /^Matrix$/i }).click();
  await expect(
    page.locator('[data-stitch-data-stitch-id="matrix-container"]').getByText(/Reflective vest|vest/i).first(),
  ).toBeVisible({ timeout: 60_000 });
  await seedInventoryDriverSession(page);
  await gotoDriverCarKit(page);
  await expect(page.getByText(/Reflective vest|vest/i).first()).toBeVisible({ timeout: 60_000 });
}

export async function runDoneTest09(page: Page) {
  expect(roadClearanceBlockCount(INV_DONE_ORG, VEH1)).toBeGreaterThan(0);
  const blocked = await acceptDeliveryOfferAsDriver(INV_DONE_DT09_OFFER_ID);
  expect(blocked.status).toBe(409);
  expect(JSON.stringify(blocked.body)).toMatch(/road_clearance_blocked/i);
  receiveSku(INV_DONE_ORG, 'ZZ-TEST-TRI', 2, 1200, 'dt09-stock');
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'vehicle-kits');
  await page.getByRole('button', { name: /^Matrix$/i }).click();
  await page.locator('[data-stitch-data-stitch-id="matrix-container"] button').filter({ hasText: 'Missing' }).first().click();
  await expect.poll(() => roadClearanceBlockCount(INV_DONE_ORG, VEH1), { timeout: 60_000 }).toBe(0);
  const cleared = await acceptDeliveryOfferAsDriver(INV_DONE_DT09_OFFER_ID);
  expect(cleared.status).toBe(200);
  await saveLiveScreenshot(page, 'inventory_asset_management_vehicle_kits_tab');
}

export async function runDoneTest10(page: Page) {
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page);
  await expect(page.getByRole('button', { name: /^Purchasing$/i })).toHaveCount(0);
  await assertPhaseBlocked('/purchase-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'ZZ-PO-1', vendor_id: null }),
  });
  await assertPhaseBlocked('/assets');
  execInventoryDb(`UPDATE public.platform_feature_flags SET enabled = true WHERE name = 'fleet_inventory_phase4_assets'`);
  await waitPhaseFlag('/assets', true);
  const onAssets = await inventoryDoneTestFetch('/assets');
  expect(onAssets.status).not.toBe(403);
  execInventoryDb(`UPDATE public.platform_feature_flags SET enabled = false WHERE name = 'fleet_inventory_phase4_assets'`);
  await waitPhaseFlag('/assets', false);
  await saveLiveScreenshot(page, 'inventory_asset_management_overview');
}

export async function runDoneTest11(page: Page) {
  const before = movementCount(INV_DONE_ORG, 'RECEIVE');
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page);
  await page.getByRole('button', { name: /^Receive$/i }).first().click();
  await page.locator('#in4-receive-first-item').selectOption({ label: 'Tyre pump' });
  await page.locator('#receive-line-0-qty').fill('1');
  const submit = page.getByRole('button', { name: /^Receive$/i }).last();
  await submit.dblclick();
  await expect.poll(() => movementCount(INV_DONE_ORG, 'RECEIVE'), { timeout: 30_000 }).toBe(before + 1);

  let abortedOnce = false;
  await page.route('**/functions/v1/fleet-core/**/inventory/**', (route) => {
    if (!abortedOnce && route.request().method() === 'POST') {
      abortedOnce = true;
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.getByRole('button', { name: /^Receive$/i }).first().click();
  await page.locator('#in4-receive-first-item').selectOption({ label: 'Tyre pump' });
  await page.locator('#receive-line-0-qty').fill('1');
  await page.getByRole('button', { name: /^Receive$/i }).last().click();
  await expect.poll(() => movementCount(INV_DONE_ORG, 'RECEIVE'), { timeout: 30_000 }).toBe(before + 1);
}

export async function runDoneTest12(page: Page) {
  receiveSku(INV_DONE_ORG, 'ZZ-TEST-PUMP', 2, 6500, 'dt12-pre');
  const stockBefore = balanceQty(INV_DONE_ORG, 'ZZ-TEST-PUMP');
  const countBefore = movementCount(INV_DONE_ORG, 'COUNT');
  expect(stockBefore).toBe(2);
  execInventoryDb(`UPDATE public.platform_feature_flags SET enabled = true WHERE name = 'fleet_inventory_phase7_counts'`);
  await waitPhaseFlag('/counts', true);
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'counts');
  await page.getByRole('button', { name: /Start count|New count/i }).first().click();
  await saveLiveScreenshot(page, 'inventory_asset_management_counts_tab');
  const countedInput = page.locator('input[type="number"], input[inputmode="numeric"]').first();
  await countedInput.fill(String(stockBefore - 1));
  await page.getByRole('button', { name: /Submit Count/i }).click();
  await seedInventoryFleetSession(page, INV_DONE_APPROVER_EMAIL);
  await gotoFleetInventory(page, 'counts');
  await page.getByRole('button', { name: /Approve & update stock/i }).click();
  await expect.poll(() => balanceQty(INV_DONE_ORG, 'ZZ-TEST-PUMP'), { timeout: 60_000 }).toBe(stockBefore - 1);
  await expect.poll(() => movementCount(INV_DONE_ORG, 'COUNT'), { timeout: 60_000 }).toBe(countBefore + 1);
}

export async function runDoneTest13(page: Page) {
  receiveSku(INV_DONE_ORG, 'ZZ-TEST-DASH', 1, 45998.85, 'dt13-rcv');
  execInventoryDb(`UPDATE public.platform_feature_flags SET enabled = true WHERE name = 'fleet_inventory_phase4_assets'`);
  await waitPhaseFlag('/assets', true);
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'assets');
  await page.getByRole('button', { name: /Register asset|Register/i }).first().click();
  await saveLiveScreenshot(page, 'inventory_asset_management_register_asset_dialog');
  await page.getByLabel(/serial/i).fill('ZZ-DT13-SN-001');
  await page.getByRole('button', { name: /Register|Save/i }).last().click();
  await page.getByRole('button', { name: /Register asset|Register/i }).first().click();
  await page.getByLabel(/serial/i).fill('ZZ-DT13-SN-001');
  await page.getByRole('button', { name: /Register|Save/i }).last().click();
  await expect(page.getByText(/already|duplicate|exists/i).first()).toBeVisible({ timeout: 30_000 });
}

export async function runDoneTest14(page: Page) {
  const before = kitComplianceDailyCount(INV_DONE_ORG);
  await seedInventoryDriverSession(page);
  const driverBase = (process.env.DRIVER_BASE_URL || 'http://127.0.0.1:5174').replace(/\/$/, '');
  await page.goto(`${driverBase}/?capture=weekly-kit`);
  await page.locator('#btn-confirm-all').waitFor({ state: 'visible', timeout: 120_000 });
  await page.locator('#btn-confirm-all').click();
  await expect.poll(() => kitComplianceDailyCount(INV_DONE_ORG), { timeout: 60_000 }).toBe(before + 1);
  await saveLiveScreenshot(page, 'weekly_check_in_kit_step', false);
}

export async function runDoneTest15(page: Page) {
  await seedInventoryFleetSession(page, INV_DONE_VIEWER_EMAIL);
  await gotoFleetInventory(page);
  await expect(page.getByText(/Read-only mode/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /^Receive$/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Issue$/i })).toHaveCount(0);
  await saveLiveScreenshot(page, 'inventory_asset_management_states_edge_cases');
}

export async function runDoneTest16(page: Page) {
  await seedInventoryFleetSession(page);
  await page.route('**/functions/v1/fleet-core/**/inventory/**', (route) => route.abort('failed'));
  await gotoFleetInventory(page);
  await expect(page.getByText(/Couldn't load/i).first()).toBeVisible({ timeout: 60_000 });
  for (const tab of ['stock', 'vehicle-kits', 'movements', 'alerts'] as const) {
    await gotoFleetInventory(page, tab);
    await expect(page.getByText(/Couldn't load/i).first()).toBeVisible({ timeout: 60_000 });
  }
  await saveLiveScreenshot(page, 'inventory_asset_management_states_edge_cases');
}

export async function runDoneTest17(page: Page) {
  await seedInventoryFleetSession(page);
  await page.goto('/vehicle-operations/inventory?tab=overview');
  await page.getByRole('button', { name: /Finish setup/i }).click();
  await page.locator('.hidden.md\\:block .inventory-stitch-root').first().waitFor({ state: 'visible', timeout: 120_000 });
  await page.getByRole('button', { name: /Add location/i }).click();
  await page.getByRole('button', { name: /Finish setup/i }).click();
  await gotoFleetInventory(page);
  await page.getByRole('button', { name: /^Receive$/i }).first().click();
  await page.locator('#in4-receive-first-item').selectOption({ label: 'Tyre pump' });
  await page.locator('#receive-line-0-qty').fill('2');
  const priceInput = page
    .locator('.grid.grid-cols-12')
    .filter({ has: page.locator('#receive-line-0-qty') })
    .locator('input[type="text"]')
    .nth(1);
  await priceInput.fill('6500');
  await page.getByRole('button', { name: /^Receive$/i }).last().click();
  await gotoFleetInventory(page);
  const expectedQty = 2;
  const expectedValue = stockValueJmd(INV_DONE_ORG, 'ZZ-TEST-PUMP');
  await expect.poll(() => balanceQty(INV_DONE_ORG, 'ZZ-TEST-PUMP'), { timeout: 30_000 }).toBe(expectedQty);
  await expect(page.getByText(/13,000|13000/).first()).toBeVisible({ timeout: 30_000 });
  expect(expectedValue).toBeGreaterThanOrEqual(13000);
  await saveLiveScreenshot(page, 'inventory_asset_management_first_time_setup');
}

export async function runDoneTest18(page: Page) {
  execInventoryDb(`
    INSERT INTO fleet.inv_chain_check (organization_id, ok, checked_at, entries, checked_by)
    VALUES ('${INV_DONE_ORG}', false, now(), 0, 'done-test-18');
    INSERT INTO fleet.inv_alert (
      organization_id, type, severity, status, title, body, snoozed_until
    ) VALUES (
      '${INV_DONE_ORG}',
      'integrity',
      'critical',
      'open',
      'Stock ledger integrity check failed',
      'Nightly check found stock numbers that do not add up.',
      NULL
    );
  `);
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page);
  await expect(page.getByText(/do not add up/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/cannot snooze/i)).toBeVisible({ timeout: 30_000 });
  const alertId = latestIntegrityAlertId(INV_DONE_ORG);
  expect(alertId).not.toBe('');
  const snooze = await inventoryDoneTestFetch(`/alerts/${alertId}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days: 1 }),
  });
  expect(snooze.status).toBeGreaterThanOrEqual(400);
  await saveLiveScreenshot(page, 'inventory_asset_management_overview');
}
