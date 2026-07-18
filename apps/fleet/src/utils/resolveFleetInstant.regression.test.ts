import { describe, expect, it } from 'vitest';
import { resolveFleetInstantBrowser } from '../services/import-validator';

/**
 * Regression: overnight Uber UTC must NOT be shifted +5h under trust_utc.
 * That bug dumped Portmore East on-trip tolls into Personal Use.
 */
describe('resolveFleetInstantBrowser trip time modes', () => {
  const tz = 'America/Jamaica';

  it('trust_utc keeps overnight Uber trip times unchanged', () => {
    const request = '2025-12-14T05:35:00.000Z';
    const dropoff = '2025-12-14T06:16:00.000Z';
    expect(resolveFleetInstantBrowser(request, tz, 'trust_utc').toISOString()).toBe(request);
    expect(resolveFleetInstantBrowser(dropoff, tz, 'trust_utc').toISOString()).toBe(dropoff);
  });

  it('default mode is trust_utc (Portmore East still on-trip)', () => {
    const request = resolveFleetInstantBrowser('2025-12-14T05:35:00.000Z', tz);
    const dropoff = resolveFleetInstantBrowser('2025-12-14T06:16:00.000Z', tz);
    const toll = new Date('2025-12-14T06:04:00.000Z'); // 1:04 AM Jamaica
    expect(toll.getTime()).toBeGreaterThanOrEqual(request.getTime());
    expect(toll.getTime()).toBeLessThanOrEqual(dropoff.getTime());
  });

  it('legacy_reinterpret still shifts overnight digits when explicitly enabled', () => {
    const out = resolveFleetInstantBrowser('2025-12-14T05:35:00.000Z', tz, 'legacy_reinterpret');
    expect(out.toISOString()).toBe('2025-12-14T10:35:00.000Z');
  });
});
