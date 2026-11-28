import { describe, expect, it } from 'vitest';
import {
  assessFillPlausibility,
  listUnreviewedImplausibleFills,
  weekHasUnreviewedImplausibleFills,
} from './fillPlausibility.ts';

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

  it('does not flag card + driver log of the same receipt on two days (Sep 21 ZZ0029145347)', () => {
    const blocked = weekHasUnreviewedImplausibleFills([
      {
        id: '47dab7e8',
        vehicleId: '5179KZ',
        date: '2026-09-24',
        amount: 6000,
        liters: 25.5,
        odometer: 187547,
        metadata: { jaaReceiptNumber: 'ZZ0029145347' },
      },
      {
        id: '7d1663d1',
        vehicleId: '5179KZ',
        date: '2026-09-25',
        amount: 6000,
        liters: 25.5,
        odometer: 187547,
        metadata: { jaaReceiptNumber: 'ZZ0029145347' },
      },
    ]);
    expect(blocked).toBe(false);
  });

  it('does not flag a split fill with card $0 L half (Sep 21 fillGroup 5b784523)', () => {
    const blocked = weekHasUnreviewedImplausibleFills([
      {
        id: '8e4584ba',
        vehicleId: '5179KZ',
        date: '2026-09-26',
        amount: 5000,
        liters: 0,
        odometer: 187759,
        metadata: {
          fillGroupId: '5b784523',
          splitPumpTotal: 6000,
          splitPumpLiters: 25.597,
        },
      },
      {
        id: '92a27a72',
        vehicleId: '5179KZ',
        date: '2026-09-26',
        amount: 1000,
        liters: 25.597,
        odometer: 187759,
        metadata: {
          fillGroupId: '5b784523',
          splitPumpTotal: 6000,
          splitPumpLiters: 25.597,
        },
      },
    ]);
    expect(blocked).toBe(false);
  });

  it('does not flag card statement + split card half of the same receipt (Sep 21 ZZ0029149831)', () => {
    const blocked = weekHasUnreviewedImplausibleFills([
      {
        id: 'c12c265e',
        vehicleId: '5179KZ',
        date: '2026-09-25',
        amount: 5000,
        liters: 0,
        odometer: 187759,
        metadata: {
          jaaReceiptNumber: 'ZZ0029149831',
          fillGroupId: '5b784523',
          splitPumpTotal: 6000,
          splitPumpLiters: 25.597,
        },
      },
      {
        id: '8e4584ba',
        vehicleId: '5179KZ',
        date: '2026-09-26',
        amount: 5000,
        liters: 0,
        odometer: 187759,
        metadata: {
          jaaReceiptNumber: 'ZZ0029149831',
          fillGroupId: '5b784523',
          splitPumpTotal: 6000,
          splitPumpLiters: 25.597,
        },
      },
    ]);
    expect(blocked).toBe(false);
  });

  it('still lists a genuine later-day same-odo stop (Sep 26 Super Lube)', () => {
    const flagged = listUnreviewedImplausibleFills([
      {
        id: 'prior',
        vehicleId: '5179KZ',
        date: '2026-09-25',
        amount: 6000,
        liters: 25.597,
        odometer: 187759,
        metadata: { jaaReceiptNumber: 'ZZ0029149831' },
      },
      {
        id: 'a76bce76',
        vehicleId: '5179KZ',
        date: '2026-09-26',
        amount: 4000,
        liters: 17.1,
        odometer: 187759,
        metadata: { jaaReceiptNumber: 'ZZ0029154003' },
      },
      {
        id: '01e6ee58',
        vehicleId: '5179KZ',
        date: '2026-09-26',
        amount: 4000,
        liters: 17.1,
        odometer: 187759,
        metadata: { jaaReceiptNumber: 'ZZ0029154003' },
      },
    ]);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].amount).toBe(4000);
    expect(flagged[0].odometer).toBe(187759);
    expect(flagged[0].reasons.some((r) => /odometer/i.test(r))).toBe(true);
  });
});

describe('assessFillPlausibility odometer order', () => {
  const codes = (input: Parameters<typeof assessFillPlausibility>[0]) =>
    assessFillPlausibility(input).map((i) => i.code);

  it('accepts a late-entered fill that sits between the fill before and after it', () => {
    // 24 Nov 3:58 PM = 200,558; 25 Nov 7:02 AM = 200,613 (entered late); 25 Nov 10:45 AM = 200,692
    expect(codes({ amount: 2000, liters: 9, odometer: 200613, previousOdometer: 200558, nextOdometer: 200692, tankCapacityLiters: 40 }))
      .not.toContain('odometer_backwards');
    expect(codes({ amount: 2000, liters: 9, odometer: 200613, previousOdometer: 200558, nextOdometer: 200692, tankCapacityLiters: 40 }))
      .not.toContain('odometer_above_next');
  });

  it('blocks a reading lower than the fill before it', () => {
    expect(codes({ amount: 2000, liters: 9, odometer: 200500, previousOdometer: 200558, tankCapacityLiters: 40 }))
      .toContain('odometer_backwards');
  });

  it('blocks a reading higher than a later fill', () => {
    expect(codes({ amount: 2000, liters: 9, odometer: 200700, previousOdometer: 200558, nextOdometer: 200692, tankCapacityLiters: 40 }))
      .toContain('odometer_above_next');
  });
});
