import { describe, expect, it } from 'vitest';
import {
  computeReimbursedTotals,
  computeTollSpendByPlatform,
  isDateInPeriod,
  tripInPeriod,
} from './tollFinancialOverview';
import type { FinancialTransaction, Trip } from '../types/data';

const TZ = 'America/Jamaica';

describe('tollFinancialOverview', () => {
  it('computeTollSpendByPlatform splits by resolved platform', () => {
    const tolls = [
      { id: '1', amount: -100, date: '2026-06-30' },
      { id: '2', amount: -50, date: '2026-06-30' },
    ] as FinancialTransaction[];
    const { total, byPlatform } = computeTollSpendByPlatform(tolls, (tx) =>
      tx.id === '1' ? 'Uber' : 'Roam',
    );
    expect(total).toBe(150);
    expect(byPlatform.Uber).toBe(100);
    expect(byPlatform.Roam).toBe(50);
  });

  it('computeReimbursedTotals scopes trips to the period', () => {
    const trips = [
      { id: 'a', platform: 'Uber', tollCharges: 645, date: '2026-06-30T13:15:21.000Z', dropoffTime: '2026-06-30T13:15:21.000Z' },
      { id: 'b', platform: 'Uber', tollCharges: 5000, date: '2026-05-01T10:00:00.000Z', dropoffTime: '2026-05-01T10:00:00.000Z' },
    ] as Trip[];

    const inPeriod = computeReimbursedTotals({
      trips,
      disputeRefunds: [],
      period: { startDate: '2026-06-29', endDate: '2026-07-05' },
      fleetTz: TZ,
    });
    expect(inPeriod.total).toBe(645);

    const allTime = computeReimbursedTotals({
      trips,
      disputeRefunds: [],
      fleetTz: TZ,
    });
    expect(allTime.total).toBe(5645);
  });

  it('tripInPeriod uses dropoff time in fleet tz', () => {
    const trip = {
      id: 'x',
      date: '2026-06-30T18:15:21.000Z',
      dropoffTime: '2026-06-30T18:15:21.000Z',
    } as Trip;
    expect(tripInPeriod(trip, '2026-06-29', '2026-07-05', TZ)).toBe(true);
    expect(tripInPeriod(trip, '2026-07-06', '2026-07-12', TZ)).toBe(false);
  });

  it('isDateInPeriod respects yyyy-MM-dd bounds', () => {
    expect(isDateInPeriod('2026-06-30T15:16:00', '2026-06-29', '2026-07-05', TZ)).toBe(true);
    expect(isDateInPeriod('2026-07-06T10:00:00', '2026-06-29', '2026-07-05', TZ)).toBe(false);
  });
});
