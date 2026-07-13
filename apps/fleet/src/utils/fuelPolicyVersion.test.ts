import { describe, expect, it } from 'vitest';
import type { FuelRule, FuelScenario } from '../types/fuel';
import {
  LEGACY_POLICY_EFFECTIVE_FROM,
  POLICY_VERSION_EARLIEST_MONDAY,
  applyPolicyTemplateSave,
  assertNoDriverWindowCollision,
  coverageRulesEqual,
  isMondayYmd,
  migrateFuelScenarioIdOntoVersions,
  mondayYmdForDate,
  nextMondayYmd,
  normalizeScenarioVersions,
  pickScenarioForDriverMembership,
  removeScenarioVersion,
  resolveDriverVersionForWeek,
  resolveScenarioForWeek,
  resolveVersionForWeek,
  upcomingMondayOptions,
  upsertPolicyVersion,
  versionWindowsOverlap,
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

  it('creates policy with empty schedule; normalize does not invent versions', () => {
    const n = normalizeScenarioVersions(scenario());
    expect(n.versions).toHaveLength(0);
    expect(n.rules[0].deadheadCoverage).toBe(100);
    expect(resolveVersionForWeek(n, '2026-07-06')?.rules[0].deadheadCoverage).toBe(100);
  });

  it('resolves version for week before/on/after effectiveFrom', () => {
    const s = normalizeScenarioVersions(
      scenario({
        versions: [
          {
            id: 'v1',
            effectiveFrom: LEGACY_POLICY_EFFECTIVE_FROM,
            rules: [baseRule(100)],
            driverIds: [],
            createdAt: '2020-01-01T00:00:00.000Z',
          },
          {
            id: 'v2',
            effectiveFrom: '2026-07-13',
            rules: [baseRule(50)],
            driverIds: [],
            createdAt: '2026-07-11T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(resolveVersionForWeek(s, '2026-07-06')?.id).toBe('v1');
    expect(resolveScenarioForWeek(s, '2026-07-06').rules[0].deadheadCoverage).toBe(100);
    expect(resolveVersionForWeek(s, '2026-07-13')?.id).toBe('v2');
    expect(resolveScenarioForWeek(s, '2026-07-13').rules[0].deadheadCoverage).toBe(50);
  });

  it('detects overlapping windows', () => {
    expect(
      versionWindowsOverlap(
        { effectiveFrom: '2026-01-12', effectiveUntil: '2026-03-30' },
        { effectiveFrom: '2026-03-02', effectiveUntil: '2026-04-06' },
      ),
    ).toBe(true);
    expect(
      versionWindowsOverlap(
        { effectiveFrom: '2026-01-12', effectiveUntil: '2026-03-30' },
        { effectiveFrom: '2026-03-30', effectiveUntil: undefined },
      ),
    ).toBe(false);
  });

  it('Rules template save updates % without creating versions', () => {
    const prev = applyPolicyTemplateSave({
      previous: null,
      next: scenario({ id: 'p1', name: 'High' }),
    });
    expect(prev.versions).toEqual([]);
    expect(prev.rules[0].deadheadCoverage).toBe(100);

    const withVers = {
      ...prev,
      versions: [
        {
          id: 'v1',
          effectiveFrom: '2026-01-12',
          rules: [baseRule(100)],
          driverIds: ['d1'],
          createdAt: '2026-01-01',
        },
      ],
    };
    const edited = applyPolicyTemplateSave({
      previous: withVers,
      next: { ...withVers, rules: [baseRule(40)] },
    });
    expect(edited.versions).toHaveLength(1);
    expect(edited.rules[0].deadheadCoverage).toBe(40);
    expect(edited.versions![0].rules[0].deadheadCoverage).toBe(100);
  });

  it('upsert freezes template rules and allows overlapping dates for different drivers', () => {
    const base = applyPolicyTemplateSave({
      previous: null,
      next: { ...scenario({ id: 'hp', name: 'High', rules: [baseRule(90)] }) },
    });
    const withFirst = upsertPolicyVersion({
      scenario: base,
      allScenarios: [base],
      effectiveFromMonday: '2026-01-12',
      effectiveUntilMonday: '2026-03-30',
      driverIds: ['d1'],
    });
    expect(withFirst.versions![0].rules[0].deadheadCoverage).toBe(90);
    expect(withFirst.versions![0].driverIds).toEqual(['d1']);

    const withSecond = upsertPolicyVersion({
      scenario: withFirst,
      allScenarios: [withFirst],
      effectiveFromMonday: '2026-01-12',
      effectiveUntilMonday: '2026-03-30',
      driverIds: ['d2'],
    });
    expect(withSecond.versions).toHaveLength(2);
  });

  it('blocks same driver overlapping windows across policies', () => {
    const a = upsertPolicyVersion({
      scenario: applyPolicyTemplateSave({
        previous: null,
        next: scenario({ id: 'a', name: 'A' }),
      }),
      allScenarios: [],
      effectiveFromMonday: '2026-01-12',
      effectiveUntilMonday: '2026-03-30',
      driverIds: ['d1'],
    });
    const bTemplate = applyPolicyTemplateSave({
      previous: null,
      next: scenario({ id: 'b', name: 'B' }),
    });
    expect(() =>
      upsertPolicyVersion({
        scenario: bTemplate,
        allScenarios: [a],
        effectiveFromMonday: '2026-02-02',
        effectiveUntilMonday: '2026-04-06',
        driverIds: ['d1'],
      }),
    ).toThrow(/overlapping/);
  });

  it('resolves driver membership then falls back to Default', () => {
    const def = {
      ...scenario({ id: 'def', name: 'Default', isDefault: true, rules: [baseRule(100)] }),
      versions: [
        {
          id: 'vd',
          effectiveFrom: LEGACY_POLICY_EFFECTIVE_FROM,
          rules: [baseRule(100)],
          driverIds: [],
          createdAt: '2020-01-01',
        },
      ],
    };
    const custom = {
      ...scenario({ id: 'c', name: 'Custom', rules: [baseRule(50)] }),
      versions: [
        {
          id: 'vc',
          effectiveFrom: '2026-01-12',
          effectiveUntil: '2026-03-30',
          rules: [baseRule(50)],
          driverIds: ['kenny'],
          createdAt: '2026-01-01',
        },
      ],
    };
    const hit = resolveDriverVersionForWeek([def, custom], 'kenny', '2026-02-02');
    expect(hit?.scenario.id).toBe('c');
    expect(hit?.version.id).toBe('vc');

    const fallback = resolveDriverVersionForWeek([def, custom], 'other', '2026-02-02');
    expect(fallback?.scenario.id).toBe('def');

    const membership = pickScenarioForDriverMembership([def, custom], 'kenny', '2026-02-02');
    expect(membership?.rules[0].deadheadCoverage).toBe(50);
  });

  it('migrates fuelScenarioId onto covering version', () => {
    const policies = [
      {
        ...scenario({ id: 'quota', name: 'Quota', rules: [baseRule(80)] }),
        versions: [
          {
            id: 'v1',
            effectiveFrom: '2026-01-05',
            rules: [baseRule(80)],
            driverIds: [],
            createdAt: '2026-01-01',
          },
        ],
      },
    ];
    const next = migrateFuelScenarioIdOntoVersions(policies, [
      { id: 'd1', fuelScenarioId: 'quota' },
    ], new Date(2026, 6, 13));
    expect(next[0].versions![0].driverIds).toContain('d1');
  });

  it('assertNoDriverWindowCollision throws for overlap', () => {
    const s = {
      ...scenario({ id: 'p', name: 'P' }),
      versions: [
        {
          id: 'v1',
          effectiveFrom: '2026-01-12',
          effectiveUntil: '2026-03-30',
          rules: [baseRule()],
          driverIds: ['d1'],
          createdAt: 'x',
        },
      ],
    };
    expect(() =>
      assertNoDriverWindowCollision({
        scenarios: [s],
        driverIds: ['d1'],
        effectiveFrom: '2026-03-02',
        effectiveUntil: '2026-04-06',
      }),
    ).toThrow(/overlapping/);
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

  it('removes a version', () => {
    const prev = normalizeScenarioVersions(
      scenario({
        versions: [
          {
            id: 'v1',
            effectiveFrom: LEGACY_POLICY_EFFECTIVE_FROM,
            rules: [baseRule(100)],
            driverIds: [],
            createdAt: '2026-01-01',
          },
          {
            id: 'v2',
            effectiveFrom: '2026-07-13',
            rules: [baseRule(50)],
            driverIds: ['d1'],
            createdAt: '2026-07-01',
          },
        ],
      }),
    );
    const next = removeScenarioVersion(prev, 'v2');
    expect(next.versions).toHaveLength(1);
    expect(next.versions![0].id).toBe('v1');
  });

  it('blocks deleting the last version', () => {
    const prev = {
      ...scenario(),
      versions: [
        {
          id: 'v1',
          effectiveFrom: LEGACY_POLICY_EFFECTIVE_FROM,
          rules: [baseRule(100)],
          driverIds: [],
          createdAt: 'x',
        },
      ],
    };
    expect(() => removeScenarioVersion(prev, 'v1')).toThrow(/at least one/);
  });
});
