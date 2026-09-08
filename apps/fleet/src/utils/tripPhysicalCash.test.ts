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

  it('does not invent fare when Cash trip has explicit cashCollected 0', () => {
    // Kenny Jan 19 pattern — Uber Cash + cashCollected: 0 must not use amount.
    expect(
      getTripPhysicalCashCollected({
        platform: 'Uber',
        paymentMethod: 'Cash',
        amount: 1754.78,
        cashCollected: 0,
      }),
    ).toBe(0);
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

  it('explicit Card wins over stale cashCollected', () => {
    expect(
      getTripPhysicalCashCollected({
        platform: 'InDrive',
        amount: 1500,
        paymentMethod: 'Card',
        cashCollected: 1500,
      }),
    ).toBe(0);
  });

  it('counts Roam trips with paymentMethod Cash when cashCollected absent', () => {
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
      { platform: 'Uber', paymentMethod: 'Cash', amount: 691.09, cashCollected: 0 },
    ]);
    expect(total).toBe(250);
  });
});
