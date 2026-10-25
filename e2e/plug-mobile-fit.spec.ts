import { expect, test, type Page } from '@playwright/test';

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
}

async function tapTargets(page: Page, selector: string) {
  const items = page.locator(selector);
  const count = await items.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await items.nth(index).boundingBox();
    expect(box, selector).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
}

test('360px welcome, explore, and sign-in fit', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/?demo=1#/welcome');
  await expect(page.getByText('DEMO').first()).toBeVisible();
  await noSideScroll(page);

  await page.goto('/?demo=1#/explore');
  await expect(page.getByRole('navigation', { name: 'Plug sections' })).toBeVisible();
  await noSideScroll(page);
  await tapTargets(page, '[data-plug-tabs] button');

  await page.getByRole('button', { name: 'Log Fuel Action' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await noSideScroll(page);
  await tapTargets(page, '[aria-label="Sign in"] button, [aria-label="Sign in"] input');
});

const SHOTS: Array<[string, number, number]> = [
  ['iphone-se', 375, 667],
  ['iphone-15', 393, 852],
  ['iphone-15-pro-max', 430, 932],
  ['pixel-7', 412, 915],
  ['galaxy-s8', 360, 740],
  ['narrow', 320, 700],
  ['ipad-mini', 768, 1024],
  ['ipad-landscape', 1180, 820],
  ['desktop', 1440, 900],
];

test('mobile screenshots', async ({ page }) => {
  test.skip(!process.env.PLUG_MOBILE_SHOTS, 'local proof only');
  for (const [name, width, height] of SHOTS) {
    await page.setViewportSize({ width, height });
    await page.goto('/?demo=1#/welcome');
    await expect(page.getByText('DEMO').first()).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({ path: `test-results/plug-mobile/${name}-welcome.png`, fullPage: false });
    await page.goto('/?demo=1#/explore');
    await expect(page.getByRole('navigation', { name: 'Plug sections' })).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({ path: `test-results/plug-mobile/${name}-explore.png`, fullPage: false });
  }
});
