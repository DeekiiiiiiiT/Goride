import { describe, expect, it } from 'vitest';
import {
  isIncompleteMegaCycle,
  partitionCyclesForPeriod,
} from './fuelCycleTrust';
import type { FuelCycle } from '../types/fuel';

function cycle(partial: Partial<FuelCycle> & { id: string }): FuelCycle {
  return {
    vehicleId: '5179KZ',
    startDate: '2026-08-19',
    endDate: '2026-09-01',
    totalLiters: 242.7,
    totalCost: 55496,
    avgPricePerLiter: 200,
    transactions: [],
    status: 'Anomaly',
    distance: 2774,
    efficiency: 11.43,
    resetType: 'Auto_Soft',
    signalTier: 'exception',
    ...partial,
  };
}

const openWeek = { start: '2026-08-31', end: '2026-09-06' };

describe('isIncompleteMegaCycle', () => {
  it('flags Aug 19→Sep 1 anomaly overlapping Aug 31–Sep 6', () => {
    expect(isIncompleteMegaCycle(cycle({ id: 'mega' }), openWeek)).toBe(true);
  });

  it('does not flag Active tank that started inside the week', () => {
    expect(
      isIncompleteMegaCycle(
        cycle({
          id: 'active',
          status: 'Active',
          signalTier: 'observe',
          startDate: '2026-09-01',
          endDate: '2026-09-05',
          distance: 802,
        }),
        openWeek,
      ),
    ).toBe(false);
  });

  it('flags pre-period cycle spanning more than 7 days even if Complete', () => {
    expect(
      isIncompleteMegaCycle(
        cycle({
          id: 'long',
          status: 'Complete',
          signalTier: 'observe',
          startDate: '2026-08-20',
          endDate: '2026-08-31',
          distance: 2000,
        }),
        openWeek,
        { periodFillToFillKm: 500 },
      ),
    ).toBe(true);
  });
});

describe('partitionCyclesForPeriod', () => {
  it('puts mega anomaly in exceptions and Active in trusted when week is open', () => {
    const mega = cycle({ id: 'mega' });
    const active = cycle({
      id: 'active',
      status: 'Active',
      signalTier: 'observe',
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      distance: 802,
      totalLiters: 34.8,
    });
    const { trusted, exceptions } = partitionCyclesForPeriod([mega, active], openWeek, {
      isPeriodOpen: true,
    });
    expect(trusted.map((c) => c.id)).toEqual(['active']);
    expect(exceptions.map((c) => c.id)).toEqual(['mega']);
  });

  it('moves Active off trusted list when the week is already closed', () => {
    const closedWeek = { start: '2026-08-17', end: '2026-08-23' };
    const complete = cycle({
      id: 'done',
      status: 'Complete',
      signalTier: 'observe',
      startDate: '2026-08-17',
      endDate: '2026-08-19',
      distance: 452,
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
    const { trusted, exceptions } = partitionCyclesForPeriod([complete, active], closedWeek, {
      isPeriodOpen: false,
    });
    expect(trusted.map((c) => c.id)).toEqual(['done']);
    expect(exceptions.map((c) => c.id)).toEqual(['active-aug19']);
  });

  it('keeps normal Complete cycles in trusted for a closed week', () => {
    const week = { start: '2026-08-24', end: '2026-08-30' };
    const closes = [
      cycle({
        id: 'c1',
        status: 'Complete',
        signalTier: 'observe',
        startDate: '2026-08-24',
        endDate: '2026-08-25',
        distance: 448,
      }),
      cycle({
        id: 'c2',
        status: 'Complete',
        signalTier: 'observe',
        startDate: '2026-08-25',
        endDate: '2026-08-27',
        distance: 463,
      }),
    ];
    const { trusted, exceptions } = partitionCyclesForPeriod(closes, week, {
      isPeriodOpen: false,
    });
    expect(trusted).toHaveLength(2);
    expect(exceptions).toHaveLength(0);
  });
});
