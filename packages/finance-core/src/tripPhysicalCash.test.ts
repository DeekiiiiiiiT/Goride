import { describe, expect, it } from 'vitest';
import { getTripPhysicalCashCollected } from './tripPhysicalCash.ts';
import { computeWeekCashBase } from './periodShareCash.ts';

describe('getTripPhysicalCashCollected', () => {
  it('trusts explicit cashCollected 0 on Cash trips (no fare invent)', () => {
    expect(
      getTripPhysicalCashCollected({
        platform: 'Uber',
        paymentMethod: 'Cash',
        amount: 1754.78,
        cashCollected: 0,
      }),
    ).toBe(0);
  });

  it('falls back to amount only when cashCollected is absent', () => {
    expect(
      getTripPhysicalCashCollected({
        platform: 'Roam',
        paymentMethod: 'Cash',
        amount: 850,
      }),
    ).toBe(850);
  });
});

describe('computeWeekCashBase — Kenny-shaped CSV vs ledger', () => {
  it('mismatch is 0 when trip Uber cash matches payout_cash', () => {
    const r = computeWeekCashBase({
      periodAnchor: '2026-01-19',
      periodEnd: '2026-01-25',
      uberPayoutCash: 36811.38,
      trips: [
        {
          date: '2026-01-20',
          platform: 'Uber',
          paymentMethod: 'Cash',
          cashCollected: 36811.38,
          amount: 37000,
        },
        {
          date: '2026-01-19',
          platform: 'Uber',
          paymentMethod: 'Cash',
          cashCollected: 0,
          amount: 1754.78,
        },
        {
          date: '2026-01-22',
          platform: 'Uber',
          paymentMethod: 'Cash',
          cashCollected: 0,
          amount: 1016.39,
        },
        {
          date: '2026-01-25',
          platform: 'Uber',
          paymentMethod: 'Cash',
          cashCollected: 0,
          amount: 691.09,
        },
        {
          date: '2026-01-21',
          platform: 'Roam',
          paymentMethod: 'Cash',
          cashCollected: 3300,
          amount: 3300,
        },
      ],
      transactions: [],
    });
    expect(r.uberTripCash).toBeCloseTo(36811.38, 2);
    expect(r.uberCash).toBeCloseTo(36811.38, 2);
    expect(r.cashSourceMismatch).toBe(0);
  });
});
