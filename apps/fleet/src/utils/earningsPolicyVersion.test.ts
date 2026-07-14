import { describe, it, expect } from 'vitest';
import {
  normalizePolicyVersions,
  versionAppliesToWeek,
  resolveVersionForWeek,
  resolveDriverVersionForWeek,
  upsertPolicyVersion,
  assertNoDriverWindowCollision,
  templateAsVersion,
  LEGACY_POLICY_EFFECTIVE_FROM,
} from './earningsPolicyVersion';
import type { EarningsPolicy, EarningsPolicyVersion } from '../types/earningsPolicy';
import { createDefaultPolicy, createEmptyQuotas, createDefaultPersonalAllowance } from './earningsPolicyDefaults';

const makePolicy = (overrides?: Partial<EarningsPolicy>): EarningsPolicy => ({
  id: 'policy-1',
  name: 'Test Policy',
  tiers: [{ id: 't1', name: 'Bronze', minEarnings: 0, maxEarnings: null, sharePercentage: 25 }],
  quotas: createEmptyQuotas(),
  personalAllowance: createDefaultPersonalAllowance(),
  isDefault: true,
  versions: [],
  ...overrides,
});

const makeVersion = (overrides?: Partial<EarningsPolicyVersion>): EarningsPolicyVersion => ({
  id: 'v1',
  effectiveFrom: '2025-12-01',
  tiers: [{ id: 't1', name: 'Bronze', minEarnings: 0, maxEarnings: null, sharePercentage: 25 }],
  quotas: createEmptyQuotas(),
  personalAllowance: createDefaultPersonalAllowance(),
  driverIds: [],
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('earningsPolicyVersion', () => {
  describe('normalizePolicyVersions', () => {
    it('returns policy with sorted versions and ensured driverIds arrays', () => {
      const policy = makePolicy({
        versions: [
          makeVersion({ id: 'v2', effectiveFrom: '2025-12-15' }),
          makeVersion({ id: 'v1', effectiveFrom: '2025-12-01' }),
        ],
      });
      const normalized = normalizePolicyVersions(policy);
      expect(normalized.versions).toHaveLength(2);
      expect(normalized.versions![0].id).toBe('v1');
      expect(normalized.versions![1].id).toBe('v2');
    });
  });

  describe('versionAppliesToWeek', () => {
    it('returns true for week within version window', () => {
      const version = makeVersion({ effectiveFrom: '2025-12-01', effectiveUntil: '2026-01-01' });
      expect(versionAppliesToWeek(version, '2025-12-08')).toBe(true);
    });

    it('returns false for week before effectiveFrom', () => {
      const version = makeVersion({ effectiveFrom: '2025-12-15' });
      expect(versionAppliesToWeek(version, '2025-12-01')).toBe(false);
    });

    it('returns false for week at or after effectiveUntil', () => {
      const version = makeVersion({ effectiveFrom: '2025-12-01', effectiveUntil: '2025-12-15' });
      expect(versionAppliesToWeek(version, '2025-12-15')).toBe(false);
    });

    it('returns true for open-ended version', () => {
      const version = makeVersion({ effectiveFrom: '2025-12-01', effectiveUntil: undefined });
      expect(versionAppliesToWeek(version, '2030-01-01')).toBe(true);
    });
  });

  describe('resolveVersionForWeek', () => {
    it('returns applicable version for the week', () => {
      const policy = makePolicy({
        versions: [
          makeVersion({ id: 'v1', effectiveFrom: '2025-12-01', effectiveUntil: '2025-12-15' }),
          makeVersion({ id: 'v2', effectiveFrom: '2025-12-15' }),
        ],
      });
      const result = resolveVersionForWeek(policy, '2025-12-22');
      expect(result?.id).toBe('v2');
    });

    it('returns synthetic template version when no versions exist', () => {
      const policy = makePolicy({ versions: [] });
      const result = resolveVersionForWeek(policy, '2025-12-01');
      expect(result?.id).toBe(`template-${policy.id}`);
      expect(result?.effectiveFrom).toBe(LEGACY_POLICY_EFFECTIVE_FROM);
    });
  });

  describe('resolveDriverVersionForWeek', () => {
    it('returns version with driver membership', () => {
      const policy = makePolicy({
        versions: [
          makeVersion({ id: 'v1', effectiveFrom: '2025-12-01', driverIds: ['driver-1'] }),
        ],
      });
      const result = resolveDriverVersionForWeek([policy], 'driver-1', '2025-12-08');
      expect(result?.version.id).toBe('v1');
    });

    it('falls back to default policy for unassigned driver', () => {
      const policy = makePolicy({
        isDefault: true,
        versions: [makeVersion({ id: 'v1', effectiveFrom: '2025-12-01', driverIds: [] })],
      });
      const result = resolveDriverVersionForWeek([policy], 'driver-2', '2025-12-08');
      expect(result?.policy.id).toBe('policy-1');
    });

    it('returns undefined when no policies exist', () => {
      const result = resolveDriverVersionForWeek([], 'driver-1', '2025-12-08');
      expect(result).toBeUndefined();
    });
  });

  describe('upsertPolicyVersion', () => {
    it('creates new version with frozen bundle', () => {
      const policy = makePolicy({ versions: [] });
      const result = upsertPolicyVersion({
        policy,
        allPolicies: [policy],
        effectiveFromMonday: '2025-12-01',
        driverIds: ['driver-1'],
      });
      expect(result.versions).toHaveLength(1);
      expect(result.versions![0].driverIds).toContain('driver-1');
      expect(result.versions![0].tiers).toEqual(policy.tiers);
    });

    it('updates existing version dates and drivers', () => {
      const version = makeVersion({ id: 'v1', effectiveFrom: '2025-12-01', driverIds: [] });
      const policy = makePolicy({ versions: [version] });
      const result = upsertPolicyVersion({
        policy,
        allPolicies: [policy],
        versionId: 'v1',
        effectiveFromMonday: '2025-12-08',
        driverIds: ['driver-1'],
      });
      expect(result.versions![0].effectiveFrom).toBe('2025-12-08');
      expect(result.versions![0].driverIds).toContain('driver-1');
    });

    it('throws on non-Monday start', () => {
      const policy = makePolicy({ versions: [] });
      expect(() =>
        upsertPolicyVersion({
          policy,
          allPolicies: [policy],
          effectiveFromMonday: '2025-12-02', // Tuesday
          driverIds: [],
        }),
      ).toThrow('Start period must be a Monday');
    });
  });

  describe('assertNoDriverWindowCollision', () => {
    it('throws when driver has overlapping window', () => {
      const policy1 = makePolicy({
        id: 'p1',
        versions: [makeVersion({ effectiveFrom: '2025-12-01', driverIds: ['driver-1'] })],
      });
      expect(() =>
        assertNoDriverWindowCollision({
          policies: [policy1],
          driverIds: ['driver-1'],
          effectiveFrom: '2025-12-08',
        }),
      ).toThrow('overlapping period');
    });

    it('allows non-overlapping windows', () => {
      const policy1 = makePolicy({
        id: 'p1',
        versions: [
          makeVersion({ effectiveFrom: '2025-12-01', effectiveUntil: '2025-12-08', driverIds: ['driver-1'] }),
        ],
      });
      expect(() =>
        assertNoDriverWindowCollision({
          policies: [policy1],
          driverIds: ['driver-1'],
          effectiveFrom: '2025-12-08',
        }),
      ).not.toThrow();
    });
  });
});
