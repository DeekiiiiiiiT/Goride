import { describe, expect, it } from 'vitest';
import type { FuelRule, FuelScenario } from '../types/fuel';
import {
  LEGACY_POLICY_EFFECTIVE_FROM,
  POLICY_VERSION_EARLIEST_MONDAY,
  applyScenarioSave,
  coverageRulesEqual,
  isMondayYmd,
  mondayYmdForDate,
  nextMondayYmd,
  normalizeScenarioVersions,
  removeScenarioVersion,
  resolveScenarioForWeek,
  resolveVersionForWeek,
  upcomingMondayOptions,
} from './fuelPolicyVersion';

const baseRule = (deadhead = 100): FuelRule => ({
  id: 'r1',
  category: 'Fuel',
  coverageType: 'Percentage',
  coverageValue: 100,
  rideShareCoverage: 100,
  companyUsageCoverage: 100,
  deadheadCoverage: deadhead,
  personalCoverage: 0,
  miscCoverage: 100,
});

const scenario = (overrides: Partial<FuelScenario> = {}): FuelScenario => ({
  id: 's1',
  name: 'Standard',
  rules: [baseRule(100)],
  ...overrides,
});

describe('fuelPolicyVersion', () => {
  it('recognizes Mondays', () => {
    expect(isMondayYmd('2026-07-06')).toBe(true);
    expect(isMondayYmd('2026-07-07')).toBe(false);
  });

  it('migrates legacy rules-only scenario', () => {
    const n = normalizeScenarioVersions(scenario());
    expect(n.versions).toHaveLength(1);
    expect(n.versions![0].effectiveFrom).toBe(LEGACY_POLICY_EFFECTIVE_FROM);
    expect(n.rules[0].deadheadCoverage).toBe(100);
  });

  it('resolves version for week before/on/after effectiveFrom', () => {
    const s = normalizeScenarioVersions(
      scenario({
        versions: [
          {
            id: 'v1',
            effectiveFrom: LEGACY_POLICY_EFFECTIVE_FROM,
            rules: [baseRule(100)],
            createdAt: '2020-01-01T00:00:00.000Z',
          },
          {
            id: 'v2',
            effectiveFrom: '2026-07-13',
            rules: [baseRule(50)],
            createdAt: '2026-07-11T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(resolveVersionForWeek(s, '2026-07-06')?.id).toBe('v1');
    expect(resolveScenarioForWeek(s, '2026-07-06').rules[0].deadheadCoverage).toBe(100);

    expect(resolveVersionForWeek(s, '2026-07-13')?.id).toBe('v2');
    expect(resolveScenarioForWeek(s, '2026-07-13').rules[0].deadheadCoverage).toBe(50);

    expect(resolveVersionForWeek(s, '2026-07-20')?.id).toBe('v2');
  });

  it('respects effectiveUntil exclusive end (Never = open)', () => {
    const s = normalizeScenarioVersions(
      scenario({
        versions: [
          {
            id: 'v1',
            effectiveFrom: LEGACY_POLICY_EFFECTIVE_FROM,
            effectiveUntil: '2026-07-13',
            rules: [baseRule(100)],
            createdAt: '2020-01-01T00:00:00.000Z',
          },
          {
            id: 'v2',
            effectiveFrom: '2026-07-13',
            effectiveUntil: '2026-07-27',
            rules: [baseRule(50)],
            createdAt: '2026-07-11T00:00:00.000Z',
          },
          {
            id: 'v3',
            effectiveFrom: '2026-07-27',
            rules: [baseRule(25)],
            createdAt: '2026-07-20T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(resolveVersionForWeek(s, '2026-07-06')?.id).toBe('v1');
    expect(resolveVersionForWeek(s, '2026-07-13')?.id).toBe('v2');
    expect(resolveVersionForWeek(s, '2026-07-20')?.id).toBe('v2');
    expect(resolveVersionForWeek(s, '2026-07-27')?.id).toBe('v3');
  });

  it('auto-closes open prior version when appending a new start', () => {
    const prev = normalizeScenarioVersions(scenario());
    const next = applyScenarioSave({
      previous: prev,
      next: { ...prev, rules: [baseRule(50)] },
      effectiveFromMonday: '2026-07-13',
      forceVersion: true,
    });
    expect(next.versions).toHaveLength(2);
    const legacy = next.versions!.find((v) => v.effectiveFrom === LEGACY_POLICY_EFFECTIVE_FROM);
    expect(legacy?.effectiveUntil).toBe('2026-07-13');
    expect(resolveVersionForWeek(next, '2026-07-06')?.effectiveUntil).toBe('2026-07-13');
    expect(resolveVersionForWeek(next, '2026-07-13')?.rules[0].deadheadCoverage).toBe(50);
  });

  it('stores explicit ending Monday on new version', () => {
    const prev = normalizeScenarioVersions(scenario());
    const next = applyScenarioSave({
      previous: prev,
      next: { ...prev, rules: [baseRule(40)] },
      effectiveFromMonday: '2026-07-13',
      effectiveUntilMonday: '2026-08-10',
      forceVersion: true,
    });
    const v = next.versions!.find((x) => x.effectiveFrom === '2026-07-13');
    expect(v?.effectiveUntil).toBe('2026-08-10');
  });

  it('append version on rule change; name-only save does not', () => {
    const prev = normalizeScenarioVersions(scenario());
    const nameOnly = applyScenarioSave({
      previous: prev,
      next: { ...prev, name: 'Renamed', rules: prev.rules },
    });
    expect(nameOnly.versions).toHaveLength(1);
    expect(nameOnly.name).toBe('Renamed');

    const withRules = applyScenarioSave({
      previous: prev,
      next: { ...prev, rules: [baseRule(50)] },
      effectiveFromMonday: '2026-07-13',
    });
    expect(withRules.versions).toHaveLength(2);
    expect(resolveScenarioForWeek(withRules, '2026-07-13').rules[0].deadheadCoverage).toBe(50);
    expect(resolveScenarioForWeek(withRules, '2026-07-06').rules[0].deadheadCoverage).toBe(100);
  });

  it('rejects rule change without Monday effectiveFrom', () => {
    const prev = normalizeScenarioVersions(scenario());
    expect(() =>
      applyScenarioSave({
        previous: prev,
        next: { ...prev, rules: [baseRule(50)] },
        effectiveFromMonday: '2026-07-14',
      }),
    ).toThrow(/Monday/);
  });

  it('coverageRulesEqual ignores rule id noise via signature fields', () => {
    expect(coverageRulesEqual([baseRule(50)], [baseRule(50)])).toBe(true);
    expect(coverageRulesEqual([baseRule(50)], [baseRule(100)])).toBe(false);
  });

  it('monday helpers return Mondays', () => {
    expect(isMondayYmd(mondayYmdForDate(new Date(2026, 6, 8)))).toBe(true);
    expect(isMondayYmd(nextMondayYmd(new Date(2026, 6, 8)))).toBe(true);
    expect(nextMondayYmd(new Date(2026, 6, 6))).toBe('2026-07-13');
  });

  it('version week dropdown includes Dec 2025 through future Mondays', () => {
    const opts = upcomingMondayOptions(4, undefined, new Date(2026, 6, 12));
    expect(opts[0]?.value).toBe(POLICY_VERSION_EARLIEST_MONDAY);
    expect(opts.some((o) => o.value === '2026-07-06')).toBe(true);
    expect(opts[opts.length - 1]?.value).toBe('2026-07-27');
  });

  it('removes a version and reopens the prior window when it was closed at that start', () => {
    const prev = normalizeScenarioVersions(
      scenario({
        versions: [
          {
            id: 'v1',
            effectiveFrom: LEGACY_POLICY_EFFECTIVE_FROM,
            effectiveUntil: '2026-07-13',
            rules: [baseRule(100)],
            createdAt: '2026-01-01',
          },
          {
            id: 'v2',
            effectiveFrom: '2026-07-13',
            rules: [baseRule(50)],
            createdAt: '2026-07-01',
          },
        ],
      }),
    );
    const next = removeScenarioVersion(prev, 'v2');
    expect(next.versions).toHaveLength(1);
    expect(next.versions![0].id).toBe('v1');
    expect(next.versions![0].effectiveUntil).toBeUndefined();
  });

  it('blocks deleting the last version', () => {
    const prev = normalizeScenarioVersions(scenario());
    expect(() => removeScenarioVersion(prev, prev.versions![0].id)).toThrow(/at least one/);
  });
});
