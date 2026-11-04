import { test, expect } from '@playwright/test';
import {
  assertNoStitchSamples,
  assertSeedMarkers,
  sweepVisibleButtons,
} from './helpers/inventory-button-sweep';

/**
 * Rev 32 — Driver car-kit button sweep (Dk1 home + in-app navigation).
 */
const DRIVER_BASE = process.env.DRIVER_BASE_URL?.trim() || process.env.DRIVER_E2E_BASE_URL?.trim() || 'http://localhost:5174';
const sweepEnabled =
  process.env.INVENTORY_BUTTON_SWEEP === '1' || process.env.CI === 'true';

test.describe('Driver car-kit button sweep (R32)', () => {
  test.skip(!sweepEnabled, 'Set INVENTORY_BUTTON_SWEEP=1 to run sweep');

  test('car-kit surfaces respond and show no Stitch samples', async ({ page }) => {
    await page.goto(`${DRIVER_BASE}/`);
    const root = page.locator('.driver-car-kit-stitch, .inventory-stitch-root').first();
    await expect(root).toBeVisible({ timeout: 90_000 });

    const stitch = await assertNoStitchSamples(root);
    expect(stitch, stitch ?? '').toBeNull();

    const seed = await assertSeedMarkers(root);
    expect(seed, seed ?? '').toBeNull();

    const failures = await sweepVisibleButtons(page, 'dk1', root);
    expect(failures, JSON.stringify(failures)).toHaveLength(0);
  });
});
