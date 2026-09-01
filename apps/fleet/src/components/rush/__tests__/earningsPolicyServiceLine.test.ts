import { describe, expect, it } from 'vitest';
import { resolveActiveEarningsBundleForDriverWeek } from '../../../utils/earningsPolicyResolve';
import type { EarningsPolicy } from '../../../types/earningsPolicy';
import {
  createEmptyQuotas,
  createDefaultPersonalAllowance,
  createDefaultTiers,
} from '../../../utils/earningsPolicyDefaults';

const legacy = {
  tiers: [{ id: 'legacy-t1', name: 'Legacy', minEarnings: 0, maxEarnings: null, sharePercentage: 20 }],
  quotas: createEmptyQuotas(),
  personalAllowance: createDefaultPersonalAllowance(),
};

describe('earnings policy service line filter', () => {
  const policies: EarningsPolicy[] = [
    {
      id: 'rideshare-default',
      name: 'Rideshare',
      serviceLine: 'rideshare',
      isDefault: true,
      tiers: createDefaultTiers(),
      quotas: createEmptyQuotas(),
      personalAllowance: createDefaultPersonalAllowance(),
    },
    {
      id: 'rush-default',
      name: 'Rush',
      serviceLine: 'rush_delivery',
      tiers: [{ id: 'rush-t1', name: 'Rush', minEarnings: 0, maxEarnings: null, sharePercentage: 15 }],
      quotas: createEmptyQuotas(),
      personalAllowance: createDefaultPersonalAllowance(),
    },
  ];

  it('picks rush tier bundle when serviceLine is rush_delivery', () => {
    const bundle = resolveActiveEarningsBundleForDriverWeek({
      policies,
      weekStartYmd: '2026-09-01',
      legacy,
      serviceLine: 'rush_delivery',
    });
    expect(bundle.policyId).toBe('rush-default');
    expect(bundle.tiers[0]?.sharePercentage).toBe(15);
  });

  it('picks rideshare tier bundle when serviceLine is rideshare', () => {
    const bundle = resolveActiveEarningsBundleForDriverWeek({
      policies,
      weekStartYmd: '2026-09-01',
      legacy,
      serviceLine: 'rideshare',
    });
    expect(bundle.policyId).toBe('rideshare-default');
  });
});
