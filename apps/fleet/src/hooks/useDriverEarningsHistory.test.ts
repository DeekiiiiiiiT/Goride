/**
 * Pure unit tests for earnings history keys/pagination helpers + fuel cache keys.
 */
import { describe, it, expect } from 'vitest';
import {
  earningsHistoryQueryKey,
  earningsHistoryInfiniteQueryKey,
  getEarningsHistoryNextPageParam,
  flattenEarningsHistoryPages,
  type EarningsHistoryPage,
} from './useDriverEarningsHistory';
import { resolvePeriodTollCashWash } from '../utils/periodTollCashSpend';
import { classifyTollLedgerEntry } from '../utils/tollDisposition';

export function driverFuelEntriesQueryKey(driverId: string, vehicleIds: string[]) {
  const sorted = [...vehicleIds].sort();
  return ['driverFuelEntries', driverId, sorted.join('|')] as const;
}

describe('driver earnings history query key', () => {
  it('flat key is stable for same driver/period/range', () => {
    const a = earningsHistoryQueryKey('d1', 'weekly', '2026-01-01', '2026-01-07');
    const b = earningsHistoryQueryKey('d1', 'weekly', '2026-01-01', '2026-01-07');
    expect(a).toEqual(b);
  });

  it('flat key changes when range or period type changes', () => {
    const a = earningsHistoryQueryKey('d1', 'weekly', '2026-01-01', '2026-01-07');
    const b = earningsHistoryQueryKey('d1', 'daily', '2026-01-01', '2026-01-07');
    expect(a).not.toEqual(b);
  });

  it('infinite key is namespaced away from flat payout cache', () => {
    const flat = earningsHistoryQueryKey('d1', 'weekly', '2026-01-01', '2026-01-07');
    const infinite = earningsHistoryInfiniteQueryKey('d1', 'weekly', '2026-01-01', '2026-01-07');
    expect(infinite).not.toEqual(flat);
    expect(infinite[1]).toBe('infinite');
  });
});

describe('earnings history pagination helpers', () => {
  it('getNextPageParam returns cursor only when hasMore', () => {
    expect(
      getEarningsHistoryNextPageParam({
        data: [],
        hasMore: true,
        nextCursor: '2026-01-01',
      }),
    ).toBe('2026-01-01');
    expect(
      getEarningsHistoryNextPageParam({
        data: [],
        hasMore: false,
        nextCursor: '2026-01-01',
      }),
    ).toBeUndefined();
    expect(
      getEarningsHistoryNextPageParam({
        data: [],
        hasMore: true,
        nextCursor: null,
      }),
    ).toBeUndefined();
  });

  it('flattenEarningsHistoryPages dedupes by periodStart across pages', () => {
    const pages: EarningsHistoryPage[] = [
      {
        data: [{ periodStart: '2026-01-07', grossRevenue: 1 }, { periodStart: '2026-01-01', grossRevenue: 2 }],
        hasMore: true,
        nextCursor: '2026-01-01',
      },
      {
        data: [{ periodStart: '2026-01-01', grossRevenue: 99 }, { periodStart: '2025-12-25', grossRevenue: 3 }],
        hasMore: false,
        nextCursor: null,
      },
    ];
    const rows = flattenEarningsHistoryPages(pages);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.periodStart)).toEqual([
      '2026-01-07',
      '2026-01-01',
      '2025-12-25',
    ]);
    expect(rows[1].grossRevenue).toBe(2);
  });
});

describe('driver fuel entries cache key', () => {
  it('includes sorted vehicle ids so N vehicles share one key', () => {
    const a = driverFuelEntriesQueryKey('d1', ['v2', 'v1']);
    const b = driverFuelEntriesQueryKey('d1', ['v1', 'v2']);
    expect(a).toEqual(b);
  });
});

describe('cash wash period SSOT', () => {
  it('prefers metadata financeCore.tollCashWashEligible', () => {
    expect(
      resolvePeriodTollCashWash({
        tollCashSpend: 900,
        metadata: { financeCore: { tollCashWashEligible: 500 } },
      })
    ).toBe(500);
  });

  it('falls back to tollCashSpend', () => {
    expect(
      resolvePeriodTollCashWash({
        tollCashSpend: 900,
        metadata: {},
      })
    ).toBe(900);
  });

  it('classifies cash paymentMethod as cashWash', () => {
    expect(
      classifyTollLedgerEntry({
        paymentMethod: 'Cash',
        tripId: 't1',
      } as any)
    ).toBe('cashWash');
  });
});
