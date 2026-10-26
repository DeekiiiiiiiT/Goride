import { expect, test } from '@playwright/test';
import { PLUG_SUPPLIED_CLOCKS, PLUG_SUPPLIED_NAMES, PLUG_SUPPLIED_PRICES, PLUG_SUPPLIED_STREETS, standIn } from './plug-stand-in';

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

const READING_ROUTES = new Set([
  '/garage',
  '/garage/car-1',
  '/garage/car-1/history',
  '/garage/car-1/spend',
  '/garage/car-1/service',
  '/fuel',
  '/fuel/confirm',
  '/fuel/details',
  '/fuel/saved',
  '/fuel/error',
  '/fuel/offline',
]);

test('an empty account shows no sample content', async ({ page }) => {
  test.setTimeout(240_000);
  for (const route of ROUTES) {
    await page.goto(`/#${route}`);
    await page.locator('body').waitFor({ state: 'visible' });
    const report = await page.evaluate(({ prices, clocks, streets }) => {
      const moneyRe = /J\$\s*[\d,]+(?:\.\d+)?/g;
      const kmRe = /\d[\d,]*(?:\.\d+)?\s*km/gi;
      const clockRe = /\d{1,2}:\d{2}\s*[AP]M/gi;
      const monthDayRe = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}\b|\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/gi;
      const streetRe = /\b[A-Z0-9][\w'.-]*(?:[-\s]+[A-Z0-9][\w'.-]*)*\s+(?:Ave\.?|Avenue|Rd\.?|Road|Street|Lane|Blvd|Dr\.?)\b/g;
      const notStreets = new Set(['one road', 'island road']);
      const allowedKm = new Set(['2 km', '5 km', '10 km', '25 km']);
      const names = [...document.querySelectorAll('[data-live-name]')].map((node) => node.getAttribute('data-live-name') || '');
      const strayMoney: string[] = [];
      const offPrice: string[] = [];
      const strayWhen: string[] = [];
      const strayStreets: string[] = [];
      const shown = (parent: HTMLElement | null) => {
        let node = parent;
        while (node) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          node = node.parentElement;
        }
        return true;
      };
      const supplied = (hit: string, parent: HTMLElement | null, values: string[]) => {
        const live = parent?.closest('[data-live-row]');
        if (!live) return false;
        const text = hit.replace(/\s+/g, ' ').trim().toLowerCase();
        return values.some((value) => {
          const item = value.replace(/\s+/g, ' ').trim().toLowerCase();
          return item.length > 0 && (text.includes(item) || item.includes(text));
        });
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        const text = node.textContent || '';
        if (shown(parent)) {
          for (const hit of text.match(moneyRe) || []) {
            const live = parent?.closest('[data-live-row]');
            const value = Number(hit.replace(/[^\d.]/g, ''));
            if (!live) strayMoney.push(hit);
            else if (!prices.some((price) => Math.abs(price - value) < 0.02)) offPrice.push(hit);
          }
          for (const hit of [...(text.match(clockRe) || []), ...(text.match(monthDayRe) || [])]) {
            if (!supplied(hit, parent, clocks)) strayWhen.push(hit);
          }
          for (const match of text.matchAll(streetRe)) {
            const after = text.slice((match.index || 0) + match[0].length).trim();
            if (/^[A-Za-z]/.test(after)) continue;
            const label = match[0].replace(/\s+/g, ' ').trim();
            if (notStreets.has(label.toLowerCase())) continue;
            if (!supplied(label, parent, streets)) strayStreets.push(label);
          }
        }
        node = walker.nextNode();
      }
      const km = [...(document.body.innerText.match(kmRe) || [])]
        .map((hit) => hit.replace(/\s+/g, ' ').toLowerCase())
        .filter((hit) => !allowedKm.has(hit));
      return { names, strayMoney, offPrice, km, strayWhen, strayStreets };
    }, { prices: PLUG_SUPPLIED_PRICES, clocks: PLUG_SUPPLIED_CLOCKS, streets: PLUG_SUPPLIED_STREETS });
    const unknown = report.names.filter((name) => !PLUG_SUPPLIED_NAMES.includes(name));
    expect(unknown, `${route} shows a place the test did not supply`).toEqual([]);
    expect(report.strayMoney, `${route} shows a price with no live row`).toEqual([]);
    expect(report.offPrice, `${route} shows a price the stand-in did not return`).toEqual([]);
    if (READING_ROUTES.has(route)) expect(report.km, `${route} shows a km reading`).toEqual([]);
    expect(report.strayWhen, `${route} shows a date or time the stand-in did not supply`).toEqual([]);
    expect(report.strayStreets, `${route} shows a street the stand-in did not supply`).toEqual([]);
    await expect(page.locator('img[src*="aida-public"], [style*="aida-public"]'), route).toHaveCount(0);
  }
});
