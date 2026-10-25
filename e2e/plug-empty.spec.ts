import { expect, test } from '@playwright/test';
import { BANNED_PHRASES } from '../apps/plug/scripts/plug-samples.mjs';
import { standIn } from './plug-stand-in';

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
  '/explore/guest',
  '/explore/list',
  '/stations/st_live',
  '/stations/st_live/directions',
  '/places/mechanic',
  '/places/facility',
  '/places/store',
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
  '/map/pin',
  '/map/pin/poor',
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

test('an empty account shows no sample content', async ({ page }) => {
  test.setTimeout(240_000);
  for (const route of ROUTES) {
    await page.goto(`/#${route}`);
    await page.locator('body').waitFor({ state: 'visible' });
    const text = await page.locator('body').innerText();
    for (const phrase of BANNED_PHRASES) {
      expect(text, `${route} shows “${phrase}”`).not.toContain(phrase);
    }
    await expect(page.locator('img[src*="aida-public"], [style*="aida-public"]'), route).toHaveCount(0);
  }
});
