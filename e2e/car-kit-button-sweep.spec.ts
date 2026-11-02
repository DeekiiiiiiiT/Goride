import { test, expect } from '@playwright/test';

/**
 * Rev 31-04 — Driver car-kit button sweep.
 * Run: INVENTORY_BUTTON_SWEEP=1 DRIVER_BASE_URL=... playwright test car-kit-button-sweep.spec.ts --project=driver-car-kit
 */
const DRIVER_BASE = process.env.DRIVER_BASE_URL?.trim() || 'http://localhost:5174';
const sweepEnabled =
  process.env.INVENTORY_BUTTON_SWEEP === '1' || process.env.CI === 'true';

test.describe('Driver car-kit button sweep (R31-04)', () => {
  test.skip(!sweepEnabled, 'Set INVENTORY_BUTTON_SWEEP=1 to run sweep');

  test('car-kit home buttons respond', async ({ page }) => {
    await page.goto(`${DRIVER_BASE}/`);
    const root = page.locator('.driver-car-kit-stitch, .inventory-stitch-root').first();
    test.skip(!(await root.isVisible().catch(() => false)), 'Open driver app on car-kit with test vehicle');

    const failures: { label: string }[] = [];
    const buttons = root.locator('button:visible');
    const n = await buttons.count();
    for (let i = 0; i < n; i++) {
      const btn = buttons.nth(i);
      if (await btn.isDisabled().catch(() => true)) continue;
      const label = (await btn.innerText().catch(() => '')).trim() || `btn-${i}`;
      const htmlBefore = await root.innerHTML().catch(() => '');
      await btn.click().catch(() => {});
      await page.waitForTimeout(300);
      const htmlAfter = await root.innerHTML().catch(() => '');
      if (htmlBefore === htmlAfter) failures.push({ label });
    }
    expect(failures, JSON.stringify(failures)).toHaveLength(0);
  });
});
