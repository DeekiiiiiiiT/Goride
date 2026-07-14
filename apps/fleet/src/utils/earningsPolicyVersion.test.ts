import { describe, it, expect } from 'vitest';
import {
  normalizePolicyVersions,
  migrateVersionToAssignments,
  assignmentAppliesToWeek,
  resolveVersionForWeek,
  resolveDriverVersionForWeek,
  upsertPolicyVersion,
  upsertDriverAssignment,
  assertNoDriverWindowCollision,
  templateAsVersion,
} from './earningsPolicyVersion';
import type { EarningsPolicy, EarningsPolicyVersion } from '../types/earningsPolicy';
import { createEmptyQuotas, createDefaultPersonalAllowance } from './earningsPolicyDefaults';

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
  tiers: [{ id: 't1', name: 'Bronze', minEarnings: 0, maxEarnings: null, sharePercentage: 25 }],
  quotas: createEmptyQuotas(),
  personalAllowance: createDefaultPersonalAllowance(),
  assignments: [],
  createdAt: '2025-12-01T00:00:00.000Z',
  ...overrides,
});

describe('earningsPolicyVersion per-driver assignments', () => {
  describe('migrateVersionToAssignments', () => {
    it('converts legacy driverIds + version window into assignments', () => {
      const legacy = makeVersion({
        effectiveFrom: '2026-04-06',
        driverIds: ['kenny'],
        assignments: [],
      });
      const migrated = migrateVersionToAssignments(legacy);
      expect(migrated.assignments).toEqual([
        { driverId: 'kenny', effectiveFrom: '2026-04-06' },
      ]);
    });

    it('keeps existing assignments untouched', () => {
      const v = makeVersion({
        assignments: [{ driverId: 'a', effectiveFrom: '2026-01-05' }],
        effectiveFrom: '2020-01-06',
        driverIds: ['ignored'],
      });
      const migrated = migrateVersionToAssignments(v);
      expect(migrated.assignments).toHaveLength(1);
      expect(migrated.assignments[0].driverId).toBe('a');
    });
  });

  describe('normalizePolicyVersions', () => {
    it('migrates legacy versions and sorts by createdAt', () => {
      const policy = makePolicy({
        versions: [
          makeVersion({
            id: 'v2',
            createdAt: '2025-12-15T00:00:00.000Z',
            effectiveFrom: '2025-12-15',
            driverIds: ['d2'],
            assignments: [],
          }),
          makeVersion({
            id: 'v1',
            createdAt: '2025-12-01T00:00:00.000Z',
            effectiveFrom: '2025-12-01',
            driverIds: ['d1'],
            assignments: [],
          }),
        ],
      });
      const normalized = normalizePolicyVersions(policy);
      expect(normalized.versions![0].id).toBe('v1');
      expect(normalized.versions![0].assignments[0].driverId).toBe('d1');
      expect(normalized.versions![1].assignments[0].driverId).toBe('d2');
    });
  });

  describe('assignmentAppliesToWeek', () => {
    it('respects half-open window', () => {
      expect(
        assignmentAppliesToWeek(
          { effectiveFrom: '2025-12-01', effectiveUntil: '2025-12-15' },
          '2025-12-08',
        ),
      ).toBe(true);
      expect(
        assignmentAppliesToWeek(
          { effectiveFrom: '2025-12-01', effectiveUntil: '2025-12-15' },
          '2025-12-15',
        ),
      ).toBe(false);
    });
  });

  describe('resolveVersionForWeek', () => {
    it('returns latest version by createdAt for Default', () => {
      const policy = makePolicy({
        versions: [
          makeVersion({ id: 'v1', createdAt: '2025-12-01T00:00:00.000Z' }),
          makeVersion({ id: 'v2', createdAt: '2025-12-15T00:00:00.000Z' }),
        ],
      });
      expect(resolveVersionForWeek(policy, '2025-12-08')?.id).toBe('v2');
    });

    it('returns synthetic template when no versions', () => {
      const policy = makePolicy({ versions: [] });
      const result = resolveVersionForWeek(policy, '2025-12-01');
      expect(result?.id).toBe(`template-${policy.id}`);
      expect(result?.assignments).toEqual([]);
    });
  });

  describe('resolveDriverVersionForWeek', () => {
    it('uses per-driver start so two hires share one version', () => {
      const policy = makePolicy({
        versions: [
          makeVersion({
            id: 'v1',
            assignments: [
              { driverId: 'early', effectiveFrom: '2026-01-05' },
              { driverId: 'late', effectiveFrom: '2026-04-06' },
            ],
          }),
        ],
      });
      expect(resolveDriverVersionForWeek([policy], 'early', '2026-02-02')?.assignment?.driverId).toBe(
        'early',
      );
      // Before late hire: no assignment → Default latest version (no assignment attach)
      const lateBeforeHire = resolveDriverVersionForWeek([policy], 'late', '2026-02-02');
      expect(lateBeforeHire?.version.id).toBe('v1');
      expect(lateBeforeHire?.assignment).toBeUndefined();
      expect(resolveDriverVersionForWeek([policy], 'late', '2026-04-13')?.assignment?.driverId).toBe(
        'late',
      );
    });

    it('returns undefined when no policies exist', () => {
      expect(resolveDriverVersionForWeek([], 'driver-1', '2025-12-08')).toBeUndefined();
    });
  });

  describe('upsertPolicyVersion', () => {
    it('creates version with empty assignments and frozen bundle', () => {
      const policy = makePolicy({ versions: [] });
      const result = upsertPolicyVersion({ policy, name: 'Launch' });
      expect(result.versions).toHaveLength(1);
      expect(result.versions![0].assignments).toEqual([]);
      expect(result.versions![0].name).toBe('Launch');
      expect(result.versions![0].tiers).toEqual(policy.tiers);
    });
  });

  describe('upsertDriverAssignment', () => {
    it('adds driver with own Monday window', () => {
      const policy = makePolicy({
        versions: [makeVersion({ id: 'v1', assignments: [] })],
      });
      const result = upsertDriverAssignment({
        policy,
        allPolicies: [policy],
        versionId: 'v1',
        driverId: 'kenny',
        effectiveFromMonday: '2026-04-06',
      });
      expect(result.versions![0].assignments).toEqual([
        { driverId: 'kenny', effectiveFrom: '2026-04-06' },
      ]);
    });

    it('throws on non-Monday start', () => {
      const policy = makePolicy({
        versions: [makeVersion({ id: 'v1' })],
      });
      expect(() =>
        upsertDriverAssignment({
          policy,
          allPolicies: [policy],
          versionId: 'v1',
          driverId: 'd1',
          effectiveFromMonday: '2025-12-02',
        }),
      ).toThrow('Start period must be a Monday');
    });
  });

  describe('assertNoDriverWindowCollision', () => {
    it('throws when driver overlaps another assignment', () => {
      const policy1 = makePolicy({
        id: 'p1',
        versions: [
          makeVersion({
            assignments: [{ driverId: 'driver-1', effectiveFrom: '2025-12-01' }],
          }),
        ],
      });
      expect(() =>
        assertNoDriverWindowCollision({
          policies: [policy1],
          driverId: 'driver-1',
          effectiveFrom: '2025-12-08',
        }),
      ).toThrow('overlapping period');
    });

    it('allows adjacent non-overlapping windows', () => {
      const policy1 = makePolicy({
        id: 'p1',
        versions: [
          makeVersion({
            assignments: [
              {
                driverId: 'driver-1',
                effectiveFrom: '2025-12-01',
                effectiveUntil: '2025-12-08',
              },
            ],
          }),
        ],
      });
      expect(() =>
        assertNoDriverWindowCollision({
          policies: [policy1],
          driverId: 'driver-1',
          effectiveFrom: '2025-12-08',
        }),
      ).not.toThrow();
    });
  });

  describe('templateAsVersion', () => {
    it('has empty assignments', () => {
      const t = templateAsVersion(makePolicy());
      expect(t?.assignments).toEqual([]);
    });
  });
});
