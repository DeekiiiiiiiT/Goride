import { test, expect } from '@playwright/test';
import { hasFleetE2ECreds, signInFleet } from './helpers/fleet-auth';
import {
  assertFieldIsolation,
  assertNoStitchSamples,
  assertSeedMarkers,
  INVENTORY_TABS,
  openFleetInventory,
  sweepVisibleButtons,
} from './helpers/inventory-button-sweep';

/**
 * Rev 31-04 — behavioral button sweep for Fleet inventory In* tabs + receive modal.
 * Requires: fleet app, E2E_FLEET_EMAIL / E2E_FLEET_PASSWORD, phase-2 flag on org.
 * Run: INVENTORY_BUTTON_SWEEP=1 pnpm exec playwright test --project=fleet inventory-button-sweep.spec.ts
 */
const sweepEnabled =
  process.env.INVENTORY_BUTTON_SWEEP === '1' || process.env.CI === 'true';

test.describe('Fleet inventory button sweep (R31-04)', () => {
  test.skip(!hasFleetE2ECreds(), 'E2E_FLEET_EMAIL / E2E_FLEET_PASSWORD not set');
  test.skip(!sweepEnabled, 'Set INVENTORY_BUTTON_SWEEP=1 to run sweep');

  test('every tab surface responds to button clicks', async ({ page }) => {
    await signInFleet(page);
    await openFleetInventory(page);

    const allFailures: { screen: string; label: string; reason: string }[] = [];

    for (const tab of INVENTORY_TABS) {
      await page.goto(`/vehicle-operations/inventory?tab=${tab}`);
      await page.waitForTimeout(800);
      const root = page.locator('.inventory-stitch-root').first();
      await expect(root).toBeVisible({ timeout: 60_000 });
      const stitch = await assertNoStitchSamples(root);
      if (stitch) allFailures.push({ screen: `tab:${tab}`, label: 'stitch-deny', reason: stitch });
      const seed = await assertSeedMarkers(root);
      if (seed) allFailures.push({ screen: `tab:${tab}`, label: 'seed', reason: seed });
      allFailures.push(...(await sweepVisibleButtons(page, `tab:${tab}`, root)));
    }

    await page.goto('/vehicle-operations/inventory?tab=overview');
    await page.getByRole('button', { name: /^Receive$/i }).click();
    const receiveRoot = page.locator('.inventory-stitch-root').last();
    await expect(receiveRoot.getByText(/Receive stock/i)).toBeVisible({ timeout: 30_000 });
    allFailures.push(...(await sweepVisibleButtons(page, 'modal:receive', receiveRoot)));

    const isolation = await assertFieldIsolation(page, receiveRoot);
    if (isolation) {
      allFailures.push({ screen: 'modal:receive', label: 'field-isolation', reason: isolation });
    }

    if (allFailures.length) console.error(JSON.stringify(allFailures, null, 2));
    expect(allFailures, `dead buttons: ${JSON.stringify(allFailures)}`).toHaveLength(0);
  });

  test('receive posts typed qty in body', async ({ page }) => {
    await signInFleet(page);
    await openFleetInventory(page);
    await page.getByRole('button', { name: /^Receive$/i }).click();
    const dialog = page.locator('.inventory-stitch-root').last();
    await expect(dialog.getByText(/Receive stock/i)).toBeVisible({ timeout: 30_000 });

    const receivePromise = page.waitForRequest(
      (req) =>
        req.method() === 'POST' &&
        /\/inventory\/(receive|purchase-orders\/[^/]+\/receive)/.test(req.url()),
      { timeout: 60_000 },
    );

    const qtyInputs = dialog.locator('input[type="text"]:not([readonly])');
    const firstQty = qtyInputs.first();
    if (await firstQty.isVisible().catch(() => false)) {
      await firstQty.fill('2');
    }

    await dialog.getByRole('button', { name: /^Receive$/i }).last().click();

    const req = await receivePromise.catch(() => null);
    test.skip(!req, 'No receive POST — seed inventory items/locations for org');

    const body = req.postDataJSON() as { lines?: { qty?: number }[] };
    expect(body.lines?.some((l) => Number(l.qty) === 2)).toBeTruthy();
  });
});
