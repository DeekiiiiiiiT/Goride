import { describe, expect, it } from 'vitest';
import { allocateSharedCost, netCourierPayout, tollClosingBalance } from './courierWeekMoney.ts';

describe('courier week money', () => {
  it('splits a shared cost by the trip mix and keeps the cents', () => {
    expect(allocateSharedCost(100, { rideshare: 1, delivery: 3 })).toEqual({
      rideshare: 25,
      delivery: 75,
    });
    expect(allocateSharedCost(10, { rideshare: 1, delivery: 2 })).toEqual({
      rideshare: 3.33,
      delivery: 6.67,
    });
  });

  it('nets payout after fuel and toll shares', () => {
    expect(netCourierPayout(1000, 120.5, 40)).toBe(839.5);
  });

  it('carries the toll closing balance', () => {
    expect(tollClosingBalance(200, 50, 80)).toBe(170);
  });

  it('does not invent a share when there were no trips', () => {
    expect(allocateSharedCost(40, { rideshare: 0, delivery: 0 })).toEqual({
      rideshare: 0,
      delivery: 0,
    });
  });
});
