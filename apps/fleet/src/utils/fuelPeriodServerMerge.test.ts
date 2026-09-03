/**
 * Landing SoT: server rows paint without browser week engines.
 */
import { describe, expect, it } from 'vitest';
import {
  mergeServerFirstLandingPeriods,
  serverRowsToLandingPeriods,
} from './fuelPeriodServerMerge';
import type { FuelPeriodRow } from '../hooks/useFuelPeriods';
import { emptyFuelStepCounts } from './fuelPeriodGating';
import type { FuelReconciliationPeriod } from './fuelPeriodStatus';

function row(partial: Partial<FuelPeriodRow> & { weekStart: string }): FuelPeriodRow {
  return {
    id: partial.id || `org:${partial.weekStart}`,
    orgId: 'org',
    weekStart: partial.weekStart,
    weekEnd: partial.weekEnd || '2026-08-30',
    status: partial.status || 'ready',
    version: 1,
    vehicleCount: partial.vehicleCount ?? 1,
    driverCount: 1,
    totalSpend: partial.totalSpend ?? 34_996.6,
    gasCardSpend: partial.totalSpend ?? 34_996.6,
    cashFromEarnings: 0,
    companyShare: partial.companyShare ?? 0,
    driverShare: partial.driverShare ?? 0,
    unexplained: partial.unexplained ?? 34_996.6,
    computedAt: partial.computedAt ?? '2026-09-01T00:00:00Z',
    ...partial,
  };
}

describe('fuelPeriodServerMerge landing SoT', () => {
  it('serverRowsToLandingPeriods paints money weeks without derive', () => {
    const cards = serverRowsToLandingPeriods([
      row({ weekStart: '2026-08-24', weekEnd: '2026-08-30' }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].totalSpend).toBeCloseTo(34_996.6, 1);
    expect(cards[0].netLeakage).toBeCloseTo(34_996.6, 1);
    expect(cards[0].counts['leakage-gap'].actionable).toBeGreaterThan(0);
  });

  it('mergeServerFirstLandingPeriods prefers server money over empty derive', () => {
    const derived: FuelReconciliationPeriod[] = [];
    const merged = mergeServerFirstLandingPeriods(
      [row({ weekStart: '2026-08-24', totalSpend: 4_000, unexplained: 4_000 })],
      derived,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].totalSpend).toBe(4_000);
  });

  it('merge keeps derived-only weeks when SQL has no row yet', () => {
    const derived: FuelReconciliationPeriod[] = [
      {
        id: '2026-08-31',
        startDate: '2026-08-31',
        endDate: '2026-09-06',
        label: 'Aug 31 – Sep 6',
        status: 'outstanding',
        locked: false,
        vehicleCount: 1,
        totalSpend: 4_000,
        netLeakage: 4_000,
        companyShare: 0,
        driverShare: 0,
        actionableTotal: 2,
        exceptionCount: 0,
        counts: emptyFuelStepCounts(),
      },
    ];
    const merged = mergeServerFirstLandingPeriods([], derived);
    expect(merged).toHaveLength(1);
    expect(merged[0].startDate).toBe('2026-08-31');
  });

  it('merge does not Complete from derived lock when SQL is ready/reopened', () => {
    const derived: FuelReconciliationPeriod[] = [
      {
        id: '2026-08-17',
        startDate: '2026-08-17',
        endDate: '2026-08-23',
        label: 'Aug 17 – Aug 23',
        status: 'completed',
        locked: true,
        vehicleCount: 1,
        totalSpend: 36_500,
        netLeakage: 2_055,
        companyShare: 0,
        driverShare: 0,
        actionableTotal: 0,
        exceptionCount: 0,
        counts: emptyFuelStepCounts(),
      },
    ];
    const ready = mergeServerFirstLandingPeriods(
      [row({ weekStart: '2026-08-17', weekEnd: '2026-08-23', status: 'ready', lockedAt: null })],
      derived,
    );
    expect(ready[0].locked).toBe(false);
    expect(ready[0].status).not.toBe('completed');

    const reopened = mergeServerFirstLandingPeriods(
      [
        row({
          weekStart: '2026-08-17',
          weekEnd: '2026-08-23',
          status: 'reopened',
          lockedAt: null,
        }),
      ],
      derived,
    );
    expect(reopened[0].locked).toBe(false);
    expect(reopened[0].status).not.toBe('completed');
  });

  it('SQL locked week is Completed regardless of derive', () => {
    const derived: FuelReconciliationPeriod[] = [
      {
        id: '2026-08-17',
        startDate: '2026-08-17',
        endDate: '2026-08-23',
        label: 'Aug 17 – Aug 23',
        status: 'outstanding',
        locked: false,
        vehicleCount: 1,
        totalSpend: 36_500,
        netLeakage: 2_055,
        companyShare: 0,
        driverShare: 0,
        actionableTotal: 2,
        exceptionCount: 0,
        counts: emptyFuelStepCounts(),
      },
    ];
    const merged = mergeServerFirstLandingPeriods(
      [
        row({
          weekStart: '2026-08-17',
          weekEnd: '2026-08-23',
          status: 'locked',
          lockedAt: '2026-08-24T00:00:00Z',
          unexplained: 0,
        }),
      ],
      derived,
    );
    expect(merged[0].locked).toBe(true);
    expect(merged[0].status).toBe('completed');
  });

  it('marks leakageReviewed when leakageReviewedAt set or week locked', () => {
    const open = serverRowsToLandingPeriods([
      row({
        weekStart: '2026-08-24',
        weekEnd: '2026-08-30',
        status: 'ready',
        unexplained: 2_055,
        leakageReviewedAt: '2026-08-30T12:00:00Z',
      }),
    ]);
    expect(open[0].leakageReviewed).toBe(true);
    expect(open[0].locked).toBe(false);

    const locked = serverRowsToLandingPeriods([
      row({
        weekStart: '2026-08-17',
        weekEnd: '2026-08-23',
        status: 'locked',
        lockedAt: '2026-08-24T00:00:00Z',
        unexplained: 2_055,
        leakageReviewedAt: null,
      }),
    ]);
    expect(locked[0].locked).toBe(true);
    expect(locked[0].leakageReviewed).toBe(true);
  });
});
