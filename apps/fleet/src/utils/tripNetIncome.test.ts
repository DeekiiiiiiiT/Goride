import { describe, expect, it } from 'vitest';
import { getTripNetIncome } from './tripNetIncome';
import type { Trip } from '../types/data';

function trip(partial: Partial<Trip>): Trip {
  return { id: 't1', date: '2026-09-01', ...partial } as Trip;
}

describe('getTripNetIncome', () => {
  it('prefers netToDriver', () => {
    expect(
      getTripNetIncome(
        trip({ netToDriver: 10, grossEarnings: 20, amount: 30, indriveNetIncome: 5 }),
      ),
    ).toBe(10);
  });

  it('uses indriveNetIncome when netToDriver missing', () => {
    expect(getTripNetIncome(trip({ platform: 'InDrive', indriveNetIncome: 42, amount: 50 }))).toBe(
      42,
    );
  });

  it('computes InDrive net from amount - service fee', () => {
    expect(
      getTripNetIncome(trip({ platform: 'InDrive', amount: 100, indriveServiceFee: 15 })),
    ).toBe(85);
  });

  it('never falls back to gross or amount for non-InDrive', () => {
    expect(getTripNetIncome(trip({ platform: 'Uber', grossEarnings: 50, amount: 50 }))).toBeNull();
  });

  it('returns null when unknown', () => {
    expect(getTripNetIncome(trip({ platform: 'InDrive', amount: 50 }))).toBeNull();
  });
});
