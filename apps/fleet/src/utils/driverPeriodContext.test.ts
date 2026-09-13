import { describe, expect, it } from 'vitest';
import {
  defaultDriverPeriod,
  readPeriodFromLocationSearch,
} from '../components/drivers/context/DriverPeriodContext';

describe('DriverPeriod helpers', () => {
  it('reads valid from/to query params', () => {
    const range = readPeriodFromLocationSearch('?from=2026-08-31&to=2026-09-06');
    expect(range).not.toBeNull();
    expect(range!.from.getFullYear()).toBe(2026);
    expect(range!.from.getMonth()).toBe(7);
    expect(range!.from.getDate()).toBe(31);
    expect(range!.to.getDate()).toBe(6);
  });

  it('rejects inverted or malformed ranges', () => {
    expect(readPeriodFromLocationSearch('?from=2026-09-06&to=2026-08-31')).toBeNull();
    expect(readPeriodFromLocationSearch('?from=nope&to=2026-09-06')).toBeNull();
    expect(readPeriodFromLocationSearch('')).toBeNull();
  });

  it('defaultDriverPeriod is the current Monday–Sunday pay week', () => {
    const range = defaultDriverPeriod();
    expect(range.from.getTime()).toBeLessThanOrEqual(range.to.getTime());
    // Current week is Mon–Sun inclusive (~6 days between noon anchors)
    const days = (range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(7);
  });
});
