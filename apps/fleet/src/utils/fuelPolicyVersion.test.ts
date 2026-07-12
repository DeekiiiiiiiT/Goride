import { describe, expect, it } from 'vitest';
import type { FuelRule, FuelScenario } from '../types/fuel';
import {
  LEGACY_POLICY_EFFECTIVE_FROM,
  applyScenarioSave,
  coverageRulesEqual,
  isMondayYmd,
  mondayYmdForDate,
  nextMondayYmd,
  normalizeScenarioVersions,
  resolveScenarioForWeek,
  resolveVersionForWeek,
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
    expect(withRules.rules[0].deadheadCoverage).toBe(50);
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
});
