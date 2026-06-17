import { describe, expect, it } from 'vitest';
import { getTripPhysicalCashCollected, sumTripPhysicalCashCollected } from './tripPhysicalCash';

describe('tripPhysicalCash', () => {
  it('uses explicit cashCollected when set', () => {
    expect(
      getTripPhysicalCashCollected({
        platform: 'Roam',
        amount: 500,
        cashCollected: 120,
      }),
    ).toBe(120);
  });

  it('does not treat Roam card trips without cash fields as cash', () => {
    expect(
      getTripPhysicalCashCollected({
        platform: 'Roam',
        amount: 850,
        paymentMethod: 'Card',
      }),
    ).toBe(0);
  });

  it('counts Roam trips with paymentMethod Cash', () => {
    expect(
      getTripPhysicalCashCollected({
        platform: 'Roam',
        amount: 850,
        paymentMethod: 'Cash',
      }),
    ).toBe(850);
  });

  it('sums only physical cash trips', () => {
    const total = sumTripPhysicalCashCollected([
      { platform: 'Roam', amount: 1000, paymentMethod: 'Card' },
      { platform: 'Roam', amount: 200, paymentMethod: 'Cash' },
      { platform: 'Uber', amount: 500, cashCollected: 50 },
    ]);
    expect(total).toBe(250);
  });
});
