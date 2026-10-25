import { expect, test, type Page } from '@playwright/test';
import { standIn } from './plug-stand-in';

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
}

async function tapTargets(page: Page, route: string) {
  const boxes = await page.locator('button, a, [role="radio"], [role="switch"]').evaluateAll((els) => (
    els.flatMap((el) => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return [];
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      if (el.closest('.leaflet-control-attribution')) return [];
      const name = (el.getAttribute('aria-label') || el.textContent || 'control').replace(/\s+/g, ' ').trim().slice(0, 60);
      return [{ w: rect.width, h: rect.height, name }];
    })
  ));
  expect(boxes.length, route).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.w, box.name).toBeGreaterThanOrEqual(44);
    expect(box.h, box.name).toBeGreaterThanOrEqual(44);
  }
}

const ROUTES = [
  '/welcome',
  '/how',
  '/signup',
  '/otp',
  '/profile',
  '/consent',
  '/permissions',
  '/login',
  '/explore',
  '/explore/offline',
  '/explore/guest',
  '/explore/list',
  '/stations/st_live',
  '/stations/st_live/directions',
  '/places/mechanic',
  '/places/facility',
  '/places/place-1',
  '/pending',
  '/tolls',
  '/search',
  '/search/empty',
  '/fuel',
  '/fuel/confirm',
  '/fuel/details',
  '/fuel/saved',
  '/fuel/error',
  '/fuel/offline',
  '/garage',
  '/garage/add',
  '/garage/add/model',
  '/garage/add/missing',
  '/garage/add/odometer',
  '/garage/added',
  '/garage/car-1',
  '/garage/car-1/remove',
  '/garage/car-1/schedule',
  '/garage/car-1/service',
  '/garage/car-1/log-service',
  '/garage/car-1/history',
  '/garage/car-1/spend',
  '/garage/car-1/documents',
  '/garage/car-1/documents/edit',
  '/parts',
  '/parts/results',
  '/parts/p1',
  '/map',
  '/map/pin/poor',
  '/map/pin',
  '/map/withdraw',
  '/map/details',
  '/map/submitted',
  '/map/submitted-toast',
  '/contributions',
  '/contributions/approved',
  '/parish',
  '/inbox',
  '/account',
  '/account/notifications',
  '/account/privacy',
  '/settings',
  '/help',
  '/gps',
  '/offline',
];

test.beforeEach(async ({ page }) => {
  await standIn(page);
});

test('360px welcome, explore, and sign-in fit', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/#/welcome');
  await expect(page.getByRole('button', { name: /Continue with Google/ }).first()).toBeVisible();
  await noSideScroll(page);

  await page.goto('/#/explore');
  await expect(page.getByRole('navigation', { name: 'Plug sections' })).toBeVisible();
  await noSideScroll(page);
  await tapTargets(page, '/explore');

  await page.getByRole('button', { name: 'Log Fuel Action' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await noSideScroll(page);
});

test('every route keeps tap targets at least 44px', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  for (const route of ROUTES) {
    await page.goto(`/#${route}`);
    await expect(page.locator('[data-plug-screen]').first()).toBeVisible();
    await expect(page.locator('[data-plug-screen="15b-explore-loading.html"]')).toHaveCount(0);
    await noSideScroll(page);
    await tapTargets(page, route);
  }
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
    await page.goto('/#/welcome');
    await expect(page.getByRole('button', { name: /Continue with Google/ }).first()).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({ path: `test-results/plug-mobile/${name}-welcome.png`, fullPage: false });
    await page.goto('/#/explore');
    await expect(page.getByRole('navigation', { name: 'Plug sections' })).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({ path: `test-results/plug-mobile/${name}-explore.png`, fullPage: false });
  }
});
