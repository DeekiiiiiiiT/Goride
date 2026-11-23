import { describe, expect, it } from 'vitest';
import type { FuelRule, FuelScenario } from '../types/fuel';
import { brainLines, firstOpenMonday, planAddVersion, splitRows, versionCards } from './fuelPolicyRulesModel';

const rule = (p: Partial<FuelRule> = {}): FuelRule => ({
  id: 'r',
  category: 'Fuel',
  coverageType: 'Percentage',
  coverageValue: 80,
  rideShareCoverage: 80,
  deadheadCoverage: 50,
  companyUsageCoverage: 100,
  personalCoverage: 0,
  commuteCoverage: 100,
  leftoverSplit: { mode: 'percentage', driverPercent: 50, appliesTo: ['variance', 'unattributedKm', 'noOdometerFills'] },
  ...p,
});

const policy = (): FuelScenario =>
  ({
    id: 'p1',
    name: 'Standard Fleet Rule',
    isDefault: true,
    rules: [rule()],
    versions: [{ id: 'v1', effectiveFrom: '2026-08-03', rules: [rule()], driverIds: ['kenny'], createdAt: '2026-08-01T00:00:00Z' }],
  }) as FuelScenario;

const frozen = ['2026-11-02', '2026-11-09', '2026-11-16'];

describe('fuelPolicyRulesModel', () => {
  it('six rows, company % from the rule; the leftover row from the leftover split', () => {
    expect(splitRows(rule()).map((r) => [r.label, r.companyPct])).toEqual([
      ['Uber trips', 80],
      ['Driving to pickups', 50],
      ['Commute', 100],
      ['Company errands', 100],
      ['Personal driving', 0],
      ['Km nobody can explain', 50],
    ]);
  });

  it('screen 16: a version dated in a locked week is refused, naming the first open week', () => {
    const r = planAddVersion({
      scenario: policy(),
      allScenarios: [policy()],
      fromMonday: '2026-11-09',
      percents: { rideShare: 75 },
      frozenMondays: frozen,
      thisMonday: '2026-11-23',
    });
    expect(r).toEqual({ ok: false, field: 'from', error: 'That week is already locked. Choose the week of 23 Nov 2026 or later.' });
    expect(firstOpenMonday(frozen, '2026-11-23')).toBe('2026-11-23');
  });

  it('a version from an open week ends the running one there and keeps its drivers', () => {
    const r = planAddVersion({
      scenario: policy(),
      allScenarios: [policy()],
      fromMonday: '2026-11-23',
      percents: { rideShare: 75 },
      frozenMondays: frozen,
      thisMonday: '2026-11-23',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [v1, v2] = r.scenario.versions!;
    expect(v1.effectiveUntil).toBe('2026-11-23');
    expect(v1.rules[0].rideShareCoverage).toBe(80);
    expect(v2.effectiveFrom).toBe('2026-11-23');
    expect(v2.effectiveUntil).toBeUndefined();
    expect(v2.driverIds).toEqual(['kenny']);
    expect(v2.rules[0].rideShareCoverage).toBe(75);
    // The template (Rules) is untouched.
    expect(r.scenario.rules[0].rideShareCoverage).toBe(80);
  });

  it('refuses no change, and a start before the latest version', () => {
    const base = { scenario: policy(), allScenarios: [policy()], frozenMondays: frozen, thisMonday: '2026-11-23' };
    expect(planAddVersion({ ...base, fromMonday: '2026-11-23', percents: { rideShare: 80 } })).toMatchObject({ ok: false, field: 'split' });
    expect(planAddVersion({ ...base, fromMonday: '2026-08-03', percents: { rideShare: 70 } })).toMatchObject({ ok: false, field: 'from' });
  });

  it('screen 15: version cards newest first with chip, what changed, locked weeks and days active', () => {
    const r = planAddVersion({
      scenario: policy(),
      allScenarios: [policy()],
      fromMonday: '2026-11-23',
      percents: { rideShare: 75 },
      frozenMondays: frozen,
      thisMonday: '2026-11-16',
    });
    if (!r.ok) throw new Error(r.error);
    const cards = versionCards(r.scenario, { thisMonday: '2026-11-16', todayYmd: '2026-11-16', frozenMondays: frozen });
    expect(cards.map((c) => [c.number, c.chip, c.appliesLine, c.lockedWeeks, c.activeDays])).toEqual([
      [2, 'Starts 23 Nov 2026', 'Applies from the week of 23 Nov 2026', 0, null],
      [1, 'Current', 'Week of 3 Aug 2026 → week of 16 Nov 2026', 3, 105],
    ]);
    expect(cards[0].changes).toEqual([{ label: 'Uber trips', now: 'company pays 75%', was: '80%' }]);
    expect(cards[1].changes).toEqual([{ label: 'Uber trips', now: 'company pays 80%' }]);
  });

  it('how Roam sorts the km, in plain words', () => {
    expect(
      brainLines({ deadhead_gap_max_minutes: 20, personal_gap_min_minutes: 60, prefer_odo_gaps: true, peak_hours_start: 6, peak_hours_end: 20 }),
    ).toEqual([
      'When the odometer was read at both trips, the km between them come from the odometer.',
      'Otherwise, a wait of up to 20 minutes between trips counts as driving to a pickup.',
      'A wait of more than 60 minutes counts as personal driving.',
      'A wait in between stays unexplained and is split by "Km nobody can explain".',
      'Peak hours: 6:00 AM to 8:00 PM.',
    ]);
  });
});
