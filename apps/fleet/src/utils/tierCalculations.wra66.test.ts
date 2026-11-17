import { describe, expect, it } from 'vitest';
import { TierCalculations } from './tierCalculations';
import { computeWeekCommissionShare, periodEndForAnchor } from '@roam/finance-core';
import type { Trip, TierConfig } from '../types/data';

const KENNY_HIGH_PERFORMER_TIERS: TierConfig[] = [
  { id: 'bronze', name: 'Bronze', minEarnings: 0, maxEarnings: 75000, sharePercentage: 25, color: '#a' },
  { id: 'silver', name: 'Silver', minEarnings: 75001, maxEarnings: 150000, sharePercentage: 27, color: '#b' },
  { id: 'gold', name: 'Gold', minEarnings: 150001, maxEarnings: 225000, sharePercentage: 29, color: '#c' },
  { id: 'platinum', name: 'Platinum', minEarnings: 225001, maxEarnings: 300000, sharePercentage: 31, color: '#d' },
  { id: 'diamond', name: 'Diamond', minEarnings: 300001, maxEarnings: 375000, sharePercentage: 33, color: '#e' },
  { id: 'boss', name: 'Boss', minEarnings: 375001, maxEarnings: 1000000, sharePercentage: 35, color: '#f' },
];

const OCT_WEEKS: Record<string, number> = {
  '2026-10-05': 83765.76,
  '2026-10-12': 54380.77,
  '2026-10-19': 88407.8,
  '2026-10-26': 96828.39,
};

function tripsFromOctoberWeeks(): Trip[] {
  const trips: Trip[] = [];
  for (const [anchor, amount] of Object.entries(OCT_WEEKS)) {
    const [y, m, d] = anchor.split('-').map(Number);
    const local = new Date(y, m - 1, d, 12, 0, 0);
    local.setDate(local.getDate() + 2);
    const date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    trips.push({
      id: anchor,
      date,
      amount,
      platform: 'Uber',
    } as Trip);
  }
  trips.push({
    id: 'straddle',
    date: '2026-10-01',
    amount: 61674.55,
    platform: 'Uber',
  } as Trip);
  return trips;
}

describe('WRA-66 fleet tier display matches paid tier (26 Oct)', () => {
  it('calculateMonthlyEarnings tier % equals computeWeekCommissionShare', () => {
    const trips = tripsFromOctoberWeeks();
    const ref = new Date('2026-10-28T12:00:00');
    const mEarnings = TierCalculations.calculateMonthlyEarnings(trips, ref);
    const displayTier = TierCalculations.getTierForEarnings(mEarnings, KENNY_HIGH_PERFORMER_TIERS);

    const fareEntries = trips.map((t) => ({
      date: typeof t.date === 'string' ? t.date : undefined,
      eventType: 'fare_earning',
      grossAmount: t.amount,
    }));
    const anchor = '2026-10-26';
    const paid = computeWeekCommissionShare({
      fareEntries,
      periodAnchor: anchor,
      periodEnd: periodEndForAnchor(anchor),
      tiers: KENNY_HIGH_PERFORMER_TIERS,
    });

    expect(displayTier.sharePercentage).toBe(paid.driverSharePercent);
    expect(displayTier.sharePercentage).toBe(33);
    expect(paid.driverShare).toBe(31953.37);
  });
});