import { describe, it, expect } from 'vitest';
import { resolveActiveEarningsBundleForDriverWeek } from './earningsPolicyResolve';
import type { EarningsPolicy } from '../types/earningsPolicy';
import { createEmptyQuotas, createDefaultPersonalAllowance, createDefaultTiers } from './earningsPolicyDefaults';

const makeLegacy = () => ({
  tiers: [{ id: 'legacy-t1', name: 'Legacy', minEarnings: 0, maxEarnings: null, sharePercentage: 20 }],
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

describe('resolveActiveEarningsBundleForDriverWeek', () => {
  describe('empty policies → legacy', () => {
    it('returns legacy when policies array is empty', () => {
      const legacy = makeLegacy();
      const result = resolveActiveEarningsBundleForDriverWeek({
        policies: [],
        driverId: 'driver-1',
        weekStartYmd: '2025-12-01',
        legacy,
      });
      expect(result.source).toBe('legacy');
      expect(result.tiers[0].name).toBe('Legacy');
    });
  });

  describe('version hit', () => {
    it('returns version when driver has covering assignment', () => {
      const versionTiers = [
        { id: 'v-t1', name: 'Version Tier', minEarnings: 0, maxEarnings: null, sharePercentage: 30 },
      ];
      const policy = makePolicy({
        versions: [
          makeVersion({
            assignments: [{ driverId: 'driver-1', effectiveFrom: '2025-12-01' }],
            tiers: versionTiers,
          }),
        ],
      });
      const result = resolveActiveEarningsBundleForDriverWeek({
        policies: [policy],
        driverId: 'driver-1',
        weekStartYmd: '2025-12-08',
        legacy: makeLegacy(),
      });
      expect(result.source).toBe('version');
      expect(result.tiers[0].name).toBe('Version Tier');
      expect(result.policyId).toBe('policy-1');
      expect(result.versionId).toBe('v1');
    });

    it('migrates legacy driverIds window into assignment hit', () => {
      const versionTiers = [
        { id: 'v-t1', name: 'Version Tier', minEarnings: 0, maxEarnings: null, sharePercentage: 30 },
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
      const result = resolveActiveEarningsBundleForDriverWeek({
        policies: [policy],
        driverId: 'driver-1',
        weekStartYmd: '2025-12-08',
        legacy: makeLegacy(),
      });
      expect(result.source).toBe('version');
      expect(result.tiers[0].name).toBe('Version Tier');
    });
  });

  describe('default hit', () => {
    it('returns default policy for unassigned driver', () => {
      const policy = makePolicy({
        isDefault: true,
        tiers: [
          { id: 'def-t1', name: 'Default Tier', minEarnings: 0, maxEarnings: null, sharePercentage: 25 },
        ],
        versions: [makeVersion({ assignments: [] })],
      });
      const result = resolveActiveEarningsBundleForDriverWeek({
        policies: [policy],
        driverId: 'driver-2',
        weekStartYmd: '2025-12-08',
        legacy: makeLegacy(),
      });
      expect(result.source).toBe('default');
      expect(result.policyId).toBe('policy-1');
    });
  });

  describe('legacy parity', () => {
    it('uses first policy fallback when no default and driver not assigned', () => {
      const policy = makePolicy({
        isDefault: false,
        versions: [
          makeVersion({
            assignments: [{ driverId: 'driver-1', effectiveFrom: '2025-12-01' }],
          }),
        ],
      });
      const result = resolveActiveEarningsBundleForDriverWeek({
        policies: [policy],
        driverId: 'driver-3',
        weekStartYmd: '2025-12-08',
        legacy: makeLegacy(),
      });
      expect(result.source).toBe('default');
    });

    it('uses default template when Default policy has empty tiers and no versions', () => {
      const policy = makePolicy({
        isDefault: true,
        tiers: [],
        versions: [],
      });
      const result = resolveActiveEarningsBundleForDriverWeek({
        policies: [policy],
        driverId: 'driver-1',
        weekStartYmd: '2025-12-08',
        legacy: makeLegacy(),
      });
      expect(result.source).toBe('default');
    });
  });
});
