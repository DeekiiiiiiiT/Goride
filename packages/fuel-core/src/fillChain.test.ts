import { describe, expect, it } from 'vitest';
import { applyFillClocks, resolveFillAt, tripBelongsToFillSpan } from './fillChain.ts';
import type { FuelEntry } from './fuelTypes.ts';

describe('fill clocks and trip spans', () => {
  it('borrows the card time, and otherwise assumes the end of the day', () => {
    expect(resolveFillAt({
      date: '2026-10-06',
      linkedTime: '19:06:55',
    })).toEqual({ at: '2026-10-06T19:06:55', assumedEndOfDay: false });
    expect(resolveFillAt({ date: '2026-10-06' })).toEqual({
      at: '2026-10-06T23:59:59',
      assumedEndOfDay: true,
    });
  });

  it('stamps a date-only manual fill with the linked card time', () => {
    const stamped = applyFillClocks([
      {
        id: 'm',
        date: '2026-10-06',
        vehicleId: 'v',
        amount: 5000,
        liters: 20,
        odometer: 1000,
        type: 'Fuel_Manual_Entry',
        paymentSource: 'Gas_Card',
        metadata: { jaaMatchedDriverEntryId: 'c' },
      } as FuelEntry,
      {
        id: 'c',
        date: '2026-10-06',
        time: '19:06:55',
        vehicleId: 'v',
        amount: 5000,
        liters: 20,
        odometer: 1000,
        type: 'Card_Transaction',
        paymentSource: 'Gas_Card',
        metadata: { jaaMatchedDriverEntryId: 'm' },
      } as FuelEntry,
    ]);
    expect(stamped.find((entry) => entry.id === 'm')?.date).toBe('2026-10-06T19:06:55');
    expect(stamped.find((entry) => entry.id === 'm')?.metadata?.clockAssumedEndOfDay).toBeUndefined();
  });

  it('puts a trip the evening of the prior fill in the next week only', () => {
    const trip = {
      date: '2026-10-17',
      requestTime: '2026-10-17T19:00:00',
      dropoffTime: '2026-10-17T19:40:00',
    };
    expect(tripBelongsToFillSpan(trip, {
      weekStart: '2026-10-19',
      weekEnd: '2026-10-25',
      priorAt: '2026-10-17T18:00:00',
      endAt: '2026-10-24T20:00:00',
    })).toBe(true);
    expect(tripBelongsToFillSpan(trip, {
      weekStart: '2026-10-12',
      weekEnd: '2026-10-18',
      priorAt: '2026-10-10T18:00:00',
      endAt: '2026-10-17T18:00:00',
    })).toBe(false);
    expect(tripBelongsToFillSpan(
      { date: '2026-10-17', requestTime: '2026-10-17T17:00:00' },
      {
        weekStart: '2026-10-19',
        weekEnd: '2026-10-25',
        priorAt: '2026-10-17T18:00:00',
        endAt: '2026-10-24T20:00:00',
      },
    )).toBe(false);
  });
});
