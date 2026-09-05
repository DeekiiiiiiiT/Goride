/**
 * UAT fixtures for Full Tanks trust — 5179KZ open + closed weeks.
 */
import { describe, expect, it } from 'vitest';
import { partitionCyclesForPeriod } from './fuelCycleTrust';
import { buildTrustedPeriodTotals } from './fuelPeriodTotals';
import { buildCycleKpis } from './fuelLogKpiMetrics';
import type { FuelCycle } from '../types/fuel';

function cycle(partial: Partial<FuelCycle> & { id: string }): FuelCycle {
  return {
    vehicleId: '5179KZ',
    startDate: '2026-08-19',
    endDate: '2026-09-01',
    totalLiters: 242.7,
    totalCost: 55496,
    avgPricePerLiter: 228.66,
    transactions: [],
    status: 'Anomaly',
    distance: 2774,
    efficiency: 11.43,
    resetType: 'Auto_Soft',
    signalTier: 'exception',
    ...partial,
  };
}

describe('UAT 5179KZ — open week Aug 31–Sep 6', () => {
  const period = { start: '2026-08-31', end: '2026-09-06' };

  const mega = cycle({ id: 'mega-aug19' });
  const active = cycle({
    id: 'active-sep1',
    status: 'Active',
    signalTier: 'observe',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    distance: 802,
    totalLiters: 34.8,
    totalCost: 8000,
    efficiency: 23.05,
  });

  it('excludes mega from list/KPIs; Active clipped only', () => {
    const { trusted, exceptions } = partitionCyclesForPeriod([mega, active], period, {
      isPeriodOpen: true,
    });
    expect(trusted.map((c) => c.id)).toEqual(['active-sep1']);
    expect(exceptions.map((c) => c.id)).toEqual(['mega-aug19']);

    const totals = buildTrustedPeriodTotals({
      trusted,
      period,
      provisional: true,
    });
    // Not inflated by mega remainder (~1031) or full mega 2774
    expect(totals.distanceKm).toBe(802);
    expect(totals.fuelL).toBe(34.8);
    expect(totals.fuelL).toBeLessThan(100);
    expect(totals.provisional).toBe(true);

    const kpis = buildCycleKpis({
      trusted,
      exceptions,
      clippedTotals: {
        distanceKm: totals.distanceKm,
        fuelL: totals.fuelL,
        spend: totals.spend,
      },
    });
    expect(kpis.totalCycles).toBe(1);
    expect(kpis.completed).toBe(0);
    expect(kpis.active).toBe(1);
    expect(kpis.exceptions).toBe(1);
    expect(kpis.totalCycles).toBe(kpis.completed + kpis.active);
    expect(kpis.totalDistance).toBe(802);
    expect(kpis.totalFuel).toBe(34.8);
  });
});

describe('UAT 5179KZ — closed week Aug 24–30', () => {
  const period = { start: '2026-08-24', end: '2026-08-30' };

  const closes: FuelCycle[] = [
    cycle({
      id: 'c1',
      status: 'Complete',
      signalTier: 'observe',
      startDate: '2026-08-24',
      endDate: '2026-08-25',
      distance: 448,
      totalLiters: 38,
      totalCost: 8700,
    }),
    cycle({
      id: 'c2',
      status: 'Complete',
      signalTier: 'observe',
      startDate: '2026-08-25',
      endDate: '2026-08-26',
      distance: 463,
      totalLiters: 39,
      totalCost: 8900,
    }),
    cycle({
      id: 'c3',
      status: 'Complete',
      signalTier: 'observe',
      startDate: '2026-08-26',
      endDate: '2026-08-27',
      distance: 410,
      totalLiters: 36,
      totalCost: 8200,
    }),
    cycle({
      id: 'c4',
      status: 'Complete',
      signalTier: 'observe',
      startDate: '2026-08-27',
      endDate: '2026-08-28',
      distance: 390,
      totalLiters: 35,
      totalCost: 8000,
    }),
    cycle({
      id: 'c5',
      status: 'Complete',
      signalTier: 'observe',
      startDate: '2026-08-28',
      endDate: '2026-08-30',
      distance: 520,
      totalLiters: 40,
      totalCost: 9100,
    }),
  ];

  it('keeps five Completes trusted; no provisional; totals match clipped', () => {
    const { trusted, exceptions } = partitionCyclesForPeriod(closes, period, {
      isPeriodOpen: false,
    });
    expect(trusted).toHaveLength(5);
    expect(exceptions).toHaveLength(0);

    const totals = buildTrustedPeriodTotals({
      trusted,
      period,
      provisional: false,
    });
    expect(totals.provisional).toBe(false);
    expect(totals.distanceKm).toBe(448 + 463 + 410 + 390 + 520);
    expect(totals.fuelL).toBe(38 + 39 + 36 + 35 + 40);

    const kpis = buildCycleKpis({
      trusted,
      exceptions,
      clippedTotals: {
        distanceKm: totals.distanceKm,
        fuelL: totals.fuelL,
        spend: totals.spend,
      },
    });
    expect(kpis.totalCycles).toBe(5);
    expect(kpis.completed).toBe(5);
    expect(kpis.active).toBe(0);
    expect(kpis.exceptions).toBe(0);
    expect(kpis.totalCycles).toBe(trusted.length);
  });
});

describe('UAT 5179KZ — closed week Aug 17–23 unclosed Active', () => {
  const period = { start: '2026-08-17', end: '2026-08-23' };

  it('does not treat open Active as a finished tank on a past week', () => {
    const complete = cycle({
      id: 'cap-close',
      status: 'Complete',
      signalTier: 'observe',
      startDate: '2026-08-17',
      endDate: '2026-08-19',
      distance: 452,
      totalLiters: 36,
    });
    const active = cycle({
      id: 'active-aug19',
      status: 'Active',
      signalTier: 'observe',
      startDate: '2026-08-19',
      endDate: '2026-08-23',
      distance: 1085,
      totalLiters: 88.3,
    });
    const mega = cycle({
      id: 'mega-aug2',
      status: 'Anomaly',
      signalTier: 'exception',
      startDate: '2026-08-02',
      endDate: '2026-08-18',
      distance: 4415,
      totalLiters: 327.8,
    });

    const { trusted, exceptions } = partitionCyclesForPeriod(
      [complete, active, mega],
      period,
      { isPeriodOpen: false },
    );

    expect(trusted.map((c) => c.id)).toEqual(['cap-close']);
    expect(exceptions.map((c) => c.id).sort()).toEqual(['active-aug19', 'mega-aug2']);

    const totals = buildTrustedPeriodTotals({ trusted, period, provisional: false });
    expect(totals.distanceKm).toBe(452);
    expect(totals.fuelL).toBe(36);
    expect(totals.distanceKm).toBeLessThan(1537);

    const kpis = buildCycleKpis({
      trusted,
      exceptions,
      clippedTotals: {
        distanceKm: totals.distanceKm,
        fuelL: totals.fuelL,
        spend: totals.spend,
      },
    });
    expect(kpis.totalCycles).toBe(1);
    expect(kpis.completed).toBe(1);
    expect(kpis.active).toBe(0);
    expect(kpis.exceptions).toBe(2);
  });
});
