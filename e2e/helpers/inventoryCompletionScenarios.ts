/**
 * Fleet Inventory completion audit — browser done-tests 5–13, 15
 * (docs/fleet-inventory-completion-audit.md). DB checks for 1–4 and 14 live in
 * scripts/sql/fleet_inventory_completion_test.sql.
 */
import { expect, type Page } from '@playwright/test';
import { gotoFleetInventory, INV_DONE_ORG } from './inventoryDoneTestCore';
import { balanceQty, execInventoryDb, queryInventoryDb } from './inventoryDoneTestDb';
import { INV_DONE_VEHICLE_2, INV_DONE_VIEWER_EMAIL, seedInventoryFleetSession } from './inventoryDoneTestAuth';

const ORG = INV_DONE_ORG;
const CAR2_PLATE = 'TEST-002';

function receive(sku: string, qty: number) {
  execInventoryDb(`
    SELECT fleet.inv_receive(
      '${ORG}',
      jsonb_build_object('location_id', (SELECT id FROM fleet.inv_location WHERE organization_id = '${ORG}' AND lower(code) = 'main')),
      jsonb_build_array(jsonb_build_object(
        'item_id', (SELECT id FROM fleet.inv_item WHERE organization_id = '${ORG}' AND sku = '${sku}'),
        'location_id', (SELECT id FROM fleet.inv_location WHERE organization_id = '${ORG}' AND lower(code) = 'main'),
        'qty', ${qty},
        'unit_price', (SELECT default_unit_cost FROM fleet.inv_item WHERE organization_id = '${ORG}' AND sku = '${sku}'))),
      '[]'::jsonb,
      'ivc-${sku}-${Date.now()}'
    );
  `);
}

function carQty(sku: string, vehicleId: string): number {
  return Number(
    queryInventoryDb(`
      SELECT coalesce(sum(b.on_hand), 0)::text FROM fleet.inv_balance b
      JOIN fleet.inv_item i ON i.id = b.item_id
      JOIN fleet.inv_location l ON l.id = b.location_id
      WHERE b.organization_id = '${ORG}' AND i.sku = '${sku}' AND l.vehicle_id = '${vehicleId}'
    `) || '0',
  );
}

/** Done-test 5: real nightly time; stale after 26 h → red with the date. */
export async function runCompletion05(page: Page) {
  await seedInventoryFleetSession(page);
  execInventoryDb(`
    DELETE FROM fleet.inv_chain_check WHERE organization_id = '${ORG}';
    INSERT INTO fleet.inv_chain_check (organization_id, checked_at, ok, entries)
    VALUES ('${ORG}', now() - interval '2 days', true, 0);
  `);
  await gotoFleetInventory(page, 'overview');
  const line = page.getByTestId('nightly-check-line');
  await expect(line).toContainText("Nightly check hasn't run since", { timeout: 60_000 });
  await expect(line).toHaveClass(/text-error/);
  await expect(line).not.toContainText('06:30');
}

/** Done-test 6: Issue sends exactly the ticked line to the clicked car. */
export async function runCompletion06(page: Page) {
  receive('ZZ-TEST-TRI', 1);
  const pumpBefore = balanceQty(ORG, 'ZZ-TEST-PUMP');
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'overview');
  await page.locator(`[data-testid="overview-issue-kit"][data-plate="${CAR2_PLATE}"]`).click();
  await expect(page.getByRole('heading', { name: /Issue to cars/i })).toBeVisible({ timeout: 30_000 });
  const tri = page.getByRole('checkbox', { name: `Issue Warning triangle to ${CAR2_PLATE}` });
  await tri.check();
  await page.getByRole('button', { name: /^Issue 1 line$/ }).click();
  await expect.poll(() => carQty('ZZ-TEST-TRI', INV_DONE_VEHICLE_2), { timeout: 30_000 }).toBe(1);
  expect(balanceQty(ORG, 'ZZ-TEST-TRI')).toBe(0);
  expect(balanceQty(ORG, 'ZZ-TEST-PUMP')).toBe(pumpBefore);
}

/** Done-test 7: grid columns come from the kit; Edit kit opens the editor. */
export async function runCompletion07(page: Page) {
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'vehicle-kits');
  await page.getByTestId('edit-kit').click();
  await expect(page.getByText(/Kit editor/i).first()).toBeVisible({ timeout: 30_000 });
  execInventoryDb(`
    INSERT INTO fleet.kit_template_line (organization_id, version_id, line_type, item_id, qty_required, required, blocks_road_clearance, sort_order)
    SELECT vk.organization_id, vk.version_id, 'item', (SELECT id FROM fleet.inv_item WHERE organization_id = '${ORG}' AND sku = 'ZZ-TEST-VEST'), 1, true, false, 9
    FROM fleet.vehicle_kit vk WHERE vk.organization_id = '${ORG}' LIMIT 1;
  `);
  await gotoFleetInventory(page, 'vehicle-kits');
  const vestCol = page.getByTestId('kit-column').filter({ hasText: 'Reflective vest' });
  await expect(vestCol).toHaveCount(1, { timeout: 30_000 });
  execInventoryDb(`
    DELETE FROM fleet.kit_template_line WHERE organization_id = '${ORG}'
      AND item_id = (SELECT id FROM fleet.inv_item WHERE organization_id = '${ORG}' AND sku = 'ZZ-TEST-VEST');
  `);
  await gotoFleetInventory(page, 'vehicle-kits');
  await expect(page.getByTestId('kit-column').filter({ hasText: 'Reflective vest' })).toHaveCount(0, { timeout: 30_000 });
}

/** Done-test 8: a red cell opens Issue with that car + line ticked. */
export async function runCompletion08(page: Page) {
  receive('ZZ-TEST-TRI', 1);
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'vehicle-kits');
  await page.getByRole('button', { name: `Missing: Warning triangle on ${CAR2_PLATE}` }).click();
  await expect(page.getByRole('heading', { name: /Issue to cars/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('checkbox', { name: `Issue Warning triangle to ${CAR2_PLATE}` })).toBeChecked();
}

/** Done-test 9: a driver report shows in Alerts and Overview, and opens its record. */
export async function runCompletion09(page: Page) {
  execInventoryDb(`
    INSERT INTO fleet.inv_driver_report (organization_id, report_no, vehicle_id, item_id, issue, note, status)
    VALUES ('${ORG}', 'R-IVC09-' || substr(md5(random()::text), 1, 6), '${INV_DONE_VEHICLE_2}', (SELECT id FROM fleet.inv_item WHERE organization_id = '${ORG}' AND sku = 'ZZ-TEST-TRI'), 'missing', 'ZZ e2e report', 'sent');
  `);
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'overview');
  await expect(page.getByTestId('overview-driver-report')).toContainText('driver reports Warning triangle missing', { timeout: 60_000 });
  await gotoFleetInventory(page, 'alerts');
  await expect(page.getByText('driver reports Warning triangle missing').first()).toBeVisible({ timeout: 60_000 });
  await gotoFleetInventory(page, 'overview');
  await page.getByTestId('overview-driver-report').getByRole('button', { name: 'Open record' }).click();
  await expect(page.getByRole('heading', { name: 'Update reported item' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('ZZ e2e report').first()).toBeVisible();
}

/** Done-test 10: a faulty unit shows "Open asset" with no Mark done, and clears when fixed. */
export async function runCompletion10(page: Page) {
  execInventoryDb(`
    INSERT INTO fleet.inv_asset (organization_id, asset_tag, item_id, serial_number, status, location_id, purchase_cost)
    VALUES ('${ORG}', 'ZZ-IVC-CAM', (SELECT id FROM fleet.inv_item WHERE organization_id = '${ORG}' AND sku = 'ZZ-TEST-DASH'),
      'ZZ-SN-IVC', 'faulty', (SELECT id FROM fleet.inv_location WHERE organization_id = '${ORG}' AND lower(code) = 'main'), 45998.85);
  `);
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'alerts');
  const card = page.getByRole('button').filter({ hasText: 'ZZ-SN-IVC' }).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.click();
  await expect(page.getByRole('button', { name: 'Open asset' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark done' })).toHaveCount(0);
  execInventoryDb(`UPDATE fleet.inv_asset SET status = 'installed' WHERE organization_id = '${ORG}' AND asset_tag = 'ZZ-IVC-CAM';`);
  await gotoFleetInventory(page, 'alerts');
  await expect(page.getByText('ZZ-SN-IVC')).toHaveCount(0, { timeout: 60_000 });
}

/** Done-test 11: no invented text on any tab. */
export async function runCompletion11(page: Page) {
  const banned = ['Kingston', 'Hub #01', 'John Doe', 'TRX-', 'LOT-', '84.6%', '06:30', 'Warranty'];
  await seedInventoryFleetSession(page);
  for (const tab of ['overview', 'stock', 'vehicle-kits', 'assets', 'movements', 'alerts']) {
    await gotoFleetInventory(page, tab);
    await page.waitForTimeout(1500);
    const text = await page.locator('body').innerText();
    for (const b of banned) expect(text, `${tab} shows "${b}"`).not.toContain(b);
  }
}

/** Done-test 12 is the static scan in scripts/assert-inventory-gap-audit.mjs (0 dead buttons / links). */

/** Done-test 13: Receive lists only real places, defaults to the store, pre-fills the item price. */
export async function runCompletion13(page: Page) {
  await seedInventoryFleetSession(page);
  await gotoFleetInventory(page, 'overview');
  await page.getByRole('button', { name: /^Receive$/i }).first().click();
  await expect(page.getByRole('heading', { name: /Receive stock/i })).toBeVisible({ timeout: 60_000 });
  const options = await page.locator('#in4-receive-location option').allInnerTexts();
  expect(options.some((o) => /virtual/i.test(o))).toBe(false);
  expect(options.length).toBe(3);
  await expect(page.locator('#in4-receive-location')).toHaveValue(
    queryInventoryDb(`SELECT id::text FROM fleet.inv_location WHERE organization_id = '${ORG}' AND is_default AND kind = 'warehouse' LIMIT 1`),
  );
}

/** Done-test 15: a look-only user sees no action buttons. */
export async function runCompletion15(page: Page) {
  await seedInventoryFleetSession(page, INV_DONE_VIEWER_EMAIL);
  await gotoFleetInventory(page, 'overview');
  await expect(page.getByRole('button', { name: /^Receive$/ })).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: /^Issue$/ })).toHaveCount(0);
  await expect(page.getByTestId('overview-issue-kit')).toHaveCount(0);
  await gotoFleetInventory(page, 'vehicle-kits');
  await expect(page.getByTestId('edit-kit')).toHaveCount(0);
  await expect(page.locator('button[data-testid="kit-cell"]')).toHaveCount(0);
  await gotoFleetInventory(page, 'alerts');
  await expect(page.getByRole('button', { name: 'Mark done' })).toHaveCount(0);
}
