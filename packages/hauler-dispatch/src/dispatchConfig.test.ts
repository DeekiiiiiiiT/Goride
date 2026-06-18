import { describe, expect, it } from 'vitest';
import { HAUL_DISPATCH_CONFIG, RIDESHARE_DISPATCH_CONFIG } from './dispatchConfig';

describe('dispatch config', () => {
  it('haul config filters haulage offers only', () => {
    const haulOffer = {
      id: '1',
      ride: { vehicle_option: 'haulage' },
    } as Parameters<typeof HAUL_DISPATCH_CONFIG.filterOffer>[0];
    const rideOffer = {
      id: '2',
      ride: { vehicle_option: 'uberx' },
    } as Parameters<typeof HAUL_DISPATCH_CONFIG.filterOffer>[0];
    expect(HAUL_DISPATCH_CONFIG.filterOffer(haulOffer)).toBe(true);
    expect(HAUL_DISPATCH_CONFIG.filterOffer(rideOffer)).toBe(false);
  });

  it('rideshare config excludes haulage offers', () => {
    const haulOffer = {
      id: '1',
      ride: { vehicle_option: 'haulage' },
    } as Parameters<typeof RIDESHARE_DISPATCH_CONFIG.filterOffer>[0];
    expect(RIDESHARE_DISPATCH_CONFIG.filterOffer(haulOffer)).toBe(false);
  });
});
