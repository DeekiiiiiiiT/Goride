/**
 * Parity: Edge earnings_policy_runtime vs client earningsPolicyResolve.
 */
import { describe, it, expect } from 'vitest';
import { resolveActiveEarningsBundleForDriverWeek as resolveClient } from './earningsPolicyResolve';
import { resolveActiveEarningsBundleForDriverWeek as resolveEdge } from '../supabase/functions/server/earnings_policy_runtime';
import type { EarningsPolicy } from '../types/earningsPolicy';
import {
  createEmptyQuotas,
  createDefaultPersonalAllowance,
  createDefaultTiers,
} from './earningsPolicyDefaults';

const makeLegacy = () => ({
  tiers: [
    {
      id: 'legacy-t1',
      name: 'Legacy',
      minEarnings: 0,
      maxEarnings: null,
      sharePercentage: 20,
      color: '#000',
    },
  ],
  quotas: createEmptyQuotas(),
  personalAllowance: createDefaultPersonalAllowance(),
});

const makePolicy = (overrides?: Partial<EarningsPolicy>): EarningsPolicy => ({
  id: 'policy-1',
  name: 'Test Policy',
  tiers: createDefaultTiers(),
  quotas: createEmptyQuotas(),
  personalAllowance: createDefaultPersonalAllowance(),
  isDefault: true,
  versions: [],
  ...overrides,
});

const makeVersion = (overrides?: any) => ({
  id: 'v1',
  tiers: createDefaultTiers(),
  quotas: createEmptyQuotas(),
  personalAllowance: createDefaultPersonalAllowance(),
  assignments: [],
  createdAt: new Date().toISOString(),
  ...overrides,
});

function assertParity(
  policies: EarningsPolicy[],
  driverId: string | null,
  weekStartYmd: string,
) {
  const legacy = makeLegacy();
  const params = { policies, driverId, weekStartYmd, legacy };
  const client = resolveClient(params);
  const edge = resolveEdge(params);
  expect(edge.source).toBe(client.source);
  expect(edge.policyId).toBe(client.policyId);
  expect(edge.versionId).toBe(client.versionId);
  expect(edge.tiers?.[0]?.name).toBe(client.tiers?.[0]?.name);
  expect(edge.tiers?.[0]?.sharePercentage).toBe(client.tiers?.[0]?.sharePercentage);
}

describe('earnings policy Edge/client resolve parity', () => {
  it('empty policies → legacy', () => {
    assertParity([], 'driver-1', '2025-12-01');
  });

  it('version assignment hit', () => {
    const versionTiers = [
      {
        id: 'v-t1',
        name: 'Version Tier',
        minEarnings: 0,
        maxEarnings: null,
        sharePercentage: 30,
        color: '#111',
      },
    ];
    const policy = makePolicy({
      versions: [
        makeVersion({
          assignments: [{ driverId: 'driver-1', effectiveFrom: '2025-12-01' }],
          tiers: versionTiers,
        }),
      ],
    });
    assertParity([policy], 'driver-1', '2025-12-08');
  });

  it('legacy driverIds migrate to assignment', () => {
    const versionTiers = [
      {
        id: 'v-t1',
        name: 'Version Tier',
        minEarnings: 0,
        maxEarnings: null,
        sharePercentage: 30,
        color: '#111',
      },
    ];
    const policy = makePolicy({
      versions: [
        makeVersion({
          effectiveFrom: '2025-12-01',
          driverIds: ['driver-1'],
          tiers: versionTiers,
        }),
      ],
    });
    assertParity([policy], 'driver-1', '2025-12-08');
  });

  it('unassigned → default', () => {
    const policy = makePolicy({
      isDefault: true,
      tiers: [
        {
          id: 'def-t1',
          name: 'Default Tier',
          minEarnings: 0,
          maxEarnings: null,
          sharePercentage: 25,
          color: '#222',
        },
      ],
      versions: [makeVersion({ assignments: [] })],
    });
    assertParity([policy], 'driver-2', '2025-12-08');
  });

  it('no isDefault → first policy as default fallback', () => {
    const policy = makePolicy({
      isDefault: false,
      versions: [
        makeVersion({
          assignments: [{ driverId: 'driver-1', effectiveFrom: '2025-12-01' }],
        }),
      ],
    });
    assertParity([policy], 'driver-3', '2025-12-08');
  });

  it('default with empty tiers and no versions', () => {
    const policy = makePolicy({
      isDefault: true,
      tiers: [],
      versions: [],
    });
    assertParity([policy], 'driver-1', '2025-12-08');
  });
});
