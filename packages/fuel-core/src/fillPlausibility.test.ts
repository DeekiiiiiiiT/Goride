import { describe, expect, it } from 'vitest';
import { weekHasUnreviewedImplausibleFills } from './fillPlausibility.ts';

describe('weekHasUnreviewedImplausibleFills', () => {
  it('does not block a card payment and a cash payment at the same pump reading', () => {
    const blocked = weekHasUnreviewedImplausibleFills([
      {
        id: 'card',
        vehicleId: '5179KZ',
        date: '2026-09-11',
        amount: 1500,
        liters: 6.63,
        odometer: 184476,
      },
      {
        id: 'cash',
        vehicleId: '5179KZ',
        date: '2026-09-11',
        amount: 3500,
        liters: 15.432,
        odometer: 184476,
      },
      {
        id: 'next',
        vehicleId: '5179KZ',
        date: '2026-09-13',
        amount: 3000,
        liters: 13.268,
        odometer: 184801,
      },
    ]);
    expect(blocked).toBe(false);
  });

  it('still blocks the same odometer on a later day until it is accepted', () => {
    const blocked = weekHasUnreviewedImplausibleFills([
      {
        id: 'a',
        vehicleId: '5179KZ',
        date: '2026-09-11',
        amount: 3000,
        liters: 13,
        odometer: 184476,
      },
      {
        id: 'b',
        vehicleId: '5179KZ',
        date: '2026-09-13',
        amount: 3000,
        liters: 13,
        odometer: 184476,
      },
    ]);
    expect(blocked).toBe(true);
  });

  it('does not block a declined swipe with amount and no litres', () => {
    const blocked = weekHasUnreviewedImplausibleFills([
      {
        id: '425cc129',
        vehicleId: '5179KZ',
        date: '2026-09-16',
        amount: 7001.7,
        liters: undefined,
        metadata: { jaaRowKind: 'declined' },
      },
    ]);
    expect(blocked).toBe(false);
  });

  it('still blocks the same amount with no litres when it is a real fill', () => {
    const blocked = weekHasUnreviewedImplausibleFills([
      {
        id: 'real-zero-liters',
        vehicleId: '5179KZ',
        date: '2026-09-16',
        amount: 7001.7,
        liters: undefined,
      },
    ]);
    expect(blocked).toBe(true);
  });
});
