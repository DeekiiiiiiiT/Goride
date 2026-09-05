/**
 * Pure unit tests for earnings history + fuel cache keys (no api import).
 */
import { describe, it, expect } from 'vitest';
import { resolvePeriodTollCashWash } from '../utils/periodTollCashSpend';
import { classifyTollLedgerEntry } from '../utils/tollDisposition';

export function earningsHistoryQueryKey(
  driverId: string,
  periodType: string,
  startDate: string | undefined,
  endDate: string | undefined,
) {
  return [
    'driverEarningsHistory',
    driverId,
    periodType,
    startDate || '',
    endDate || '',
  ] as const;
}

export function driverFuelEntriesQueryKey(driverId: string, vehicleIds: string[]) {
  const sorted = [...vehicleIds].sort();
  return ['driverFuelEntries', driverId, sorted.join('|')] as const;
}

describe('driver earnings history query key', () => {
  it('is stable for same driver/period/range', () => {
    const a = earningsHistoryQueryKey('d1', 'weekly', '2026-01-01', '2026-01-07');
    const b = earningsHistoryQueryKey('d1', 'weekly', '2026-01-01', '2026-01-07');
    expect(a).toEqual(b);
  });

  it('changes when range or period type changes', () => {
    const a = earningsHistoryQueryKey('d1', 'weekly', '2026-01-01', '2026-01-07');
    const b = earningsHistoryQueryKey('d1', 'daily', '2026-01-01', '2026-01-07');
    expect(a).not.toEqual(b);
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
