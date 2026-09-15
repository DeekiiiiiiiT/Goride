/**
 * R-5: present cashCollected including 0 is authoritative for rush_delivery.
 * Mirrors computeTripFareCashCollected rules for unit test without Deno edge imports.
 */
import { describe, expect, it } from 'vitest';
import { getTripPhysicalCashCollected } from './tripPhysicalCash';

describe('delivery cashCollected authority (R-5)', () => {
  it('cashCollected 0 on Cash payment does not invent fare', () => {
    expect(
      getTripPhysicalCashCollected({
        cashCollected: 0,
        paymentMethod: 'Cash',
        amount: 2500,
      }),
    ).toBe(0);
  });

  it('absent cashCollected on Cash may fall back to amount (legacy)', () => {
    expect(
      getTripPhysicalCashCollected({
        paymentMethod: 'Cash',
        amount: 800,
      }),
    ).toBe(800);
  });
});
