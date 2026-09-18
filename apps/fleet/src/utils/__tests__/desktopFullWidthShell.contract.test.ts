import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

describe('desktop full-width shell contract', () => {
  it('AppLayout uses a moderate desktop max, not 7xl and not uncapped', () => {
    const src = readFileSync(resolve(ROOT, 'components/layout/AppLayout.tsx'), 'utf8');
    expect(src).not.toMatch(/max-w-7xl/);
    expect(src).toMatch(/md:max-w-\[1400px\]/);
    expect(src).toMatch(/md:mx-auto/);
  });

  it('nested desks share the same desktop max (mobile uncapped)', () => {
    const files = [
      'components/layout/AnnouncementBanner.tsx',
      'components/admin/AdminLayout.tsx',
      'components/fleet-financials/DriverSettlementsPage.tsx',
      'components/fleet-financials/WeekReconciliationPage.tsx',
    ];
    for (const rel of files) {
      const src = readFileSync(resolve(ROOT, rel), 'utf8');
      expect(src, rel).not.toMatch(/max-w-7xl/);
      expect(src, rel).toMatch(/md:max-w-\[1400px\]/);
    }
    const timeline = readFileSync(
      resolve(ROOT, 'components/vehicles/odometer/MasterLogTimeline.tsx'),
      'utf8',
    );
    expect(timeline).not.toMatch(/max-w-7xl/);
    expect(timeline).toMatch(/md:max-w-\[1400px\]/);
    expect(timeline).toMatch(/embedded[\s\S]*w-full min-w-0 space-y-6 p-2/);
  });
});
