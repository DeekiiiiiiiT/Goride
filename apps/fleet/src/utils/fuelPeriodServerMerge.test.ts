import { describe, expect, it } from 'vitest';
import {
  overlayServerFuelPeriods,
  serverComputedWeekStarts,
  serverLeakageReviewedWeekStarts,
  serverLockedWeekStarts,
} from './fuelPeriodServerMerge';
import type { FuelReconciliationPeriod } from './fuelPeriodStatus';
import { emptyFuelStepCounts } from './fuelPeriodGating';

function basePeriod(partial: Partial<FuelReconciliationPeriod>): FuelReconciliationPeriod {
  return {
    id: 'w1',
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    label: 'Jul 6',
    status: 'outstanding',
    locked: false,
    vehicleCount: 2,
    totalSpend: 100,
    netLeakage: 10,
    companyShare: 40,
    driverShare: 60,
    actionableTotal: 1,
    exceptionCount: 0,
    counts: emptyFuelStepCounts(),
    ...partial,
  };
}

describe('fuelPeriodServerMerge (Wave G)', () => {
  it('locks + prefers server money when period locked', () => {
    const out = overlayServerFuelPeriods(
      [basePeriod({})],
      [
        {
          id: 'org:2026-07-06',
          orgId: 'org',
          weekStart: '2026-07-06',
          weekEnd: '2026-07-12',
          status: 'locked',
          version: 2,
          vehicleCount: 3,
          driverCount: 2,
          totalSpend: 999,
          gasCardSpend: 800,
          cashFromEarnings: 199,
          companyShare: 400,
          driverShare: 599,
          unexplained: 0,
          lockedAt: '2026-07-13T00:00:00Z',
        },
      ],
    );
    expect(out[0].locked).toBe(true);
    expect(out[0].status).toBe('completed');
    expect(out[0].totalSpend).toBe(999);
    expect(out[0].netLeakage).toBe(0);
  });

  it('collects leakage + locked week starts', () => {
    const rows = [
      {
        id: 'a',
        orgId: 'o',
        weekStart: '2026-07-06',
        weekEnd: '2026-07-12',
        status: 'open' as const,
        version: 1,
        vehicleCount: 0,
        driverCount: 0,
        totalSpend: 0,
        gasCardSpend: 0,
        cashFromEarnings: 0,
        companyShare: 0,
        driverShare: 0,
        unexplained: 0,
        leakageReviewedAt: '2026-07-10T00:00:00Z',
      },
      {
        id: 'b',
        orgId: 'o',
        weekStart: '2026-07-13',
        weekEnd: '2026-07-19',
        status: 'locked' as const,
        version: 1,
        vehicleCount: 0,
        driverCount: 0,
        totalSpend: 0,
        gasCardSpend: 0,
        cashFromEarnings: 0,
        companyShare: 0,
        driverShare: 0,
        unexplained: 0,
        lockedAt: '2026-07-20T00:00:00Z',
      },
    ];
    expect([...serverLeakageReviewedWeekStarts(rows)]).toEqual(['2026-07-06']);
    expect([...serverLockedWeekStarts(rows)]).toEqual(['2026-07-13']);
  });

  it('collects computed week starts when computedAt or locked', () => {
    const rows = [
      {
        id: 'a',
        orgId: 'o',
        weekStart: '2026-07-06',
        weekEnd: '2026-07-12',
        status: 'open' as const,
        version: 1,
        vehicleCount: 0,
        driverCount: 0,
        totalSpend: 10,
        gasCardSpend: 10,
        cashFromEarnings: 0,
        companyShare: 0,
        driverShare: 0,
        unexplained: 1,
        computedAt: '2026-07-10T00:00:00Z',
      },
      {
        id: 'b',
        orgId: 'o',
        weekStart: '2026-07-13',
        weekEnd: '2026-07-19',
        status: 'open' as const,
        version: 1,
        vehicleCount: 0,
        driverCount: 0,
        totalSpend: 0,
        gasCardSpend: 0,
        cashFromEarnings: 0,
        companyShare: 0,
        driverShare: 0,
        unexplained: 0,
      },
    ];
    expect([...serverComputedWeekStarts(rows)]).toEqual(['2026-07-06']);
  });
});
