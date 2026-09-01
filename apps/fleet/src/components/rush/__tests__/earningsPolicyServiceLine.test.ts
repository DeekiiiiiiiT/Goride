import { describe, expect, it } from 'vitest';
import { resolveActiveEarningsBundleForDriverWeek } from '../../../utils/earningsPolicyResolve';
import { createDefaultTiers, createEmptyQuotas, createDefaultPersonalAllowance } from '../../../utils/earningsPolicyDefaults';

describe('earningsPolicy serviceLine', () => {
  const legacy = {
    tiers: createDefaultTiers(),
    quotas: createEmptyQuotas(),
    personalAllowance: createDefaultPersonalAllowance(),
  };

  it('filters policies by rush_delivery service line', () => {
    const bundle = resolveActiveEarningsBundleForDriverWeek({
      policies: [
        {
          id: 'p1',
          name: 'Rush',
          isDefault: true,
          serviceLine: 'rush_delivery',
          tiers: [{ id: 't1', name: 'Rush Tier', minTrips: 0, maxTrips: 999, percentage: 80 }],
          quotas: createEmptyQuotas(),
          personalAllowance: createDefaultPersonalAllowance(),
          versions: [],
        },
        {
          id: 'p2',
          name: 'Ride',
          isDefault: false,
          serviceLine: 'rideshare',
          tiers: [{ id: 't2', name: 'Ride Tier', minTrips: 0, maxTrips: 999, percentage: 70 }],
          quotas: createEmptyQuotas(),
          personalAllowance: createDefaultPersonalAllowance(),
          versions: [],
        },
      ] as any,
      driverId: 'd1',
      weekStartYmd: '2026-09-01',
      legacy,
      serviceLine: 'rush_delivery',
    });
    expect(bundle.policyName).toBe('Rush');
  });
});
