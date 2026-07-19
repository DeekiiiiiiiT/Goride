import { describe, expect, it } from 'vitest';
import {
  computeReimbursedTotals,
  computeTollSpendByPlatform,
  computeGrossTollSpendByPlatform,
  collectTripsForReimbursedCard,
  isDateInPeriod,
  resolveTollPlatformBucket,
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

  it('computeGrossTollSpendByPlatform includes unlinked trip tolls by platform', () => {
    const { total, byPlatform, tagTotal } = computeGrossTollSpendByPlatform({
      tolls: [],
      resolvePlatform: () => 'Unlinked',
      unclaimedRefunds: [
        { id: 'u1', platform: 'Uber', tollCharges: 275 } as Trip,
        { id: 'u2', platform: 'Uber', tollCharges: 370 } as Trip,
        { id: 'u3', platform: 'Uber', tollCharges: 370 } as Trip,
      ],
    });
    expect(tagTotal).toBe(0);
    expect(total).toBe(1015);
    expect(byPlatform.Uber).toBe(1015);
  });

  it('computeGrossTollSpendByPlatform does not double-count linked trips', () => {
    const { total, byPlatform, tagTotal } = computeGrossTollSpendByPlatform({
      tolls: [
        {
          id: 't1',
          amount: -275,
          tripId: 'u1',
          linkedTrip: { id: 'u1', platform: 'Uber', tollCharges: 275 },
        } as FinancialTransaction & { linkedTrip: { id: string; platform: string; tollCharges: number } },
      ],
      resolvePlatform: () => 'Uber',
      unclaimedRefunds: [{ id: 'u1', platform: 'Uber', tollCharges: 275 } as Trip],
    });
    expect(tagTotal).toBe(275);
    expect(total).toBe(275);
    expect(byPlatform.Uber).toBe(275);
  });

  it('computeGrossTollSpendByPlatform skips phantom trip credits', () => {
    const { total } = computeGrossTollSpendByPlatform({
      tolls: [],
      resolvePlatform: () => 'Unlinked',
      resolvedRefunds: [
        {
          id: 'p1',
          platform: 'Uber',
          tollCharges: 400,
          tollRefundResolution: { status: 'phantom' },
        } as Trip,
      ],
    });
    expect(total).toBe(0);
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

  it('resolveTollPlatformBucket uses linkedTrip when trip map misses', () => {
    const tx = {
      id: 'toll1',
      amount: -2400,
      tripId: 'trip-mobay',
      linkedTrip: { id: 'trip-mobay', platform: 'Uber', tollCharges: 2400, date: '2026-01-05' },
    } as FinancialTransaction & { linkedTrip: { id: string; platform: string; tollCharges: number; date: string } };

    expect(resolveTollPlatformBucket(tx, new Map())).toBe('Uber');
    expect(resolveTollPlatformBucket({ ...tx, linkedTrip: null, tripId: null } as typeof tx, new Map())).toBe(
      'Unlinked',
    );
  });

  it('collectTripsForReimbursedCard includes cash_wash for platform display, not for fleet mode', () => {
    const resolvedRefunds = [
      {
        id: 'trip-wash',
        platform: 'Uber',
        tollCharges: 780,
        date: '2025-12-30T02:08:51.000Z',
        dropoffTime: '2025-12-30T03:22:42.000Z',
        tollRefundResolution: { status: 'cash_wash' },
      } as Trip,
      {
        id: 'trip-expense',
        platform: 'Uber',
        tollCharges: 400,
        date: '2025-12-30T04:00:00.000Z',
        dropoffTime: '2025-12-30T04:30:00.000Z',
        tollRefundResolution: { status: 'expense_logged' },
      } as Trip,
    ];

    const platformCollected = collectTripsForReimbursedCard({
      trips: [],
      unclaimedRefunds: [],
      resolvedRefunds,
      tolls: [],
    });
    const platformTotals = computeReimbursedTotals({
      trips: platformCollected,
      disputeRefunds: [],
      period: { startDate: '2025-12-29', endDate: '2026-01-04' },
      fleetTz: TZ,
    });
    expect(platformTotals.total).toBe(1180);

    const fleetCollected = collectTripsForReimbursedCard({
      trips: [],
      unclaimedRefunds: [],
      resolvedRefunds,
      tolls: [],
      mode: 'fleet',
    });
    const fleetTotals = computeReimbursedTotals({
      trips: fleetCollected,
      disputeRefunds: [],
      period: { startDate: '2025-12-29', endDate: '2026-01-04' },
      fleetTz: TZ,
    });
    expect(fleetTotals.total).toBe(400);
  });

  it('collectTripsForReimbursedCard pulls linkedTrip credits when trips dump is empty', () => {
    const collected = collectTripsForReimbursedCard({
      trips: [],
      unclaimedRefunds: [],
      tolls: [
        {
          id: 'toll1',
          amount: -2400,
          tripId: 'trip-mobay',
          linkedTrip: {
            id: 'trip-mobay',
            platform: 'Uber',
            tollCharges: 2400,
            date: '2026-01-05T12:45:58.000Z',
            dropoffTime: '2026-01-05T12:45:58.000Z',
          },
        } as FinancialTransaction & {
          linkedTrip: {
            id: string;
            platform: string;
            tollCharges: number;
            date: string;
            dropoffTime: string;
          };
        },
      ],
    });

    const totals = computeReimbursedTotals({
      trips: collected,
      disputeRefunds: [],
      period: { startDate: '2026-01-05', endDate: '2026-01-11' },
      fleetTz: TZ,
    });
    expect(totals.total).toBe(2400);
    expect(totals.byPlatform.Uber).toBe(2400);
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
