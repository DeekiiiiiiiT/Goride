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
});
