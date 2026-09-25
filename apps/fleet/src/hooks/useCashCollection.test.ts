/**
 * Unit tests for shared Collect-cash gates (Dashboard + Settlements desk).
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  collectBlockReason,
  groupCashDrivers,
  owedMajor,
  type CashDriver,
} from './useCashCollection';
import type { SettlementQueueRow } from './useSettlementQueue';
import { isSettlementPeriodEnded } from '../utils/settlementPeriodGate';

vi.mock('../utils/settlementPeriodGate', () => ({
  isSettlementPeriodEnded: vi.fn(),
}));

const ended = isSettlementPeriodEnded as unknown as ReturnType<typeof vi.fn>;

function row(partial: Partial<SettlementQueueRow> & Pick<SettlementQueueRow, 'driverId'>): SettlementQueueRow {
  return {
    driverId: partial.driverId,
    driverName: partial.driverName ?? 'Driver',
    periodAnchor: partial.periodAnchor ?? '2026-09-01',
    periodEnd: partial.periodEnd ?? '2026-09-07',
    amountOwedMinor: partial.amountOwedMinor ?? 0,
    amountOwed: partial.amountOwed,
    moneyUnlocked: partial.moneyUnlocked,
    periodFrozen: partial.periodFrozen,
    sealBroken: partial.sealBroken,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('collectBlockReason', () => {
  it('blocks open weeks', () => {
    ended.mockReturnValue(false);
    expect(
      collectBlockReason(row({ driverId: 'd1', moneyUnlocked: true })),
    ).toBe('Week still open — settle after it ends');
  });

  it('blocks sealBroken', () => {
    ended.mockReturnValue(true);
    expect(
      collectBlockReason(row({ driverId: 'd1', moneyUnlocked: true, sealBroken: true })),
    ).toBe('Close seal broken — resolve in Close Week');
  });

  it('blocks periodFrozen', () => {
    ended.mockReturnValue(true);
    expect(
      collectBlockReason(row({ driverId: 'd1', moneyUnlocked: true, periodFrozen: true })),
    ).toBe('Week closed — reopen it in Close Week');
  });

  it('blocks when moneyUnlocked is not true', () => {
    ended.mockReturnValue(true);
    expect(collectBlockReason(row({ driverId: 'd1', moneyUnlocked: false }))).toBe(
      'Fuel/toll not cleared for this week',
    );
    expect(collectBlockReason(row({ driverId: 'd1' }))).toBe(
      'Fuel/toll not cleared for this week',
    );
  });

  it('returns null for a clean ended week', () => {
    ended.mockReturnValue(true);
    expect(
      collectBlockReason(row({ driverId: 'd1', moneyUnlocked: true, amountOwed: 100 })),
    ).toBeNull();
  });
});

describe('owedMajor', () => {
  it('prefers amountOwed major units', () => {
    expect(owedMajor(row({ driverId: 'd1', amountOwed: 12.5, amountOwedMinor: 999 }))).toBe(12.5);
  });

  it('falls back to minor units', () => {
    expect(owedMajor(row({ driverId: 'd1', amountOwedMinor: 2500 }))).toBe(25);
  });
});

describe('groupCashDrivers', () => {
  it('sums only collectable weeks and excludes fully blocked drivers', () => {
    ended.mockImplementation((input: { periodAnchor?: string }) => {
      // Open week: periodAnchor 2026-09-15
      return String(input.periodAnchor || '') !== '2026-09-15';
    });

    const rows: SettlementQueueRow[] = [
      row({
        driverId: 'kenny',
        driverName: 'Kenny',
        periodAnchor: '2026-09-01',
        periodEnd: '2026-09-07',
        amountOwed: 100,
        moneyUnlocked: true,
      }),
      row({
        driverId: 'kenny',
        driverName: 'Kenny',
        periodAnchor: '2026-09-08',
        periodEnd: '2026-09-14',
        amountOwed: 50,
        moneyUnlocked: true,
        periodFrozen: true,
      }),
      row({
        driverId: 'blocked',
        driverName: 'Blocked Only',
        periodAnchor: '2026-09-01',
        periodEnd: '2026-09-07',
        amountOwed: 80,
        moneyUnlocked: false,
      }),
      row({
        driverId: 'open-only',
        driverName: 'Still Open',
        periodAnchor: '2026-09-15',
        periodEnd: '2026-09-21',
        amountOwed: 40,
        moneyUnlocked: true,
      }),
    ];

    const drivers = groupCashDrivers(rows);
    expect(drivers.map((d: CashDriver) => d.driverId)).toEqual(['kenny']);
    expect(drivers[0].totalOwed).toBe(100);
    expect(drivers[0].weeks).toHaveLength(1);
    expect(drivers[0].blockedCount).toBe(1);
  });

  it('sorts weeks newest first and drivers by total owed desc', () => {
    ended.mockReturnValue(true);
    const rows: SettlementQueueRow[] = [
      row({
        driverId: 'a',
        driverName: 'A',
        periodAnchor: '2026-08-25',
        periodEnd: '2026-08-31',
        amountOwed: 10,
        moneyUnlocked: true,
      }),
      row({
        driverId: 'a',
        driverName: 'A',
        periodAnchor: '2026-09-01',
        periodEnd: '2026-09-07',
        amountOwed: 20,
        moneyUnlocked: true,
      }),
      row({
        driverId: 'b',
        driverName: 'B',
        periodAnchor: '2026-09-01',
        periodEnd: '2026-09-07',
        amountOwed: 200,
        moneyUnlocked: true,
      }),
    ];
    const drivers = groupCashDrivers(rows);
    expect(drivers.map((d) => d.driverId)).toEqual(['b', 'a']);
    expect(drivers[1].weeks.map((w) => w.periodAnchor)).toEqual(['2026-09-01', '2026-08-25']);
    expect(drivers[1].totalOwed).toBe(30);
  });
});
