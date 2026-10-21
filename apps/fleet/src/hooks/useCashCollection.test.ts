/**
 * Unit tests for receipt-first Log Cash gates (Dashboard + Settlements desk).
 */
import { describe, expect, it } from 'vitest';
import {
  receiptBlockReason,
  collectBlockReason,
  groupCashDrivers,
  owedMajor,
  receiptProvisionalHint,
  type CashDriver,
} from './useCashCollection';
import type { SettlementQueueRow } from './useSettlementQueue';

function row(partial: Partial<SettlementQueueRow> & Pick<SettlementQueueRow, 'driverId'>): SettlementQueueRow {
  return {
    driverId: partial.driverId,
    driverName: partial.driverName ?? 'Driver',
    periodAnchor: partial.periodAnchor ?? '2026-09-01',
    periodEnd: partial.periodEnd ?? '2026-09-07',
    amountOwedMinor: partial.amountOwedMinor ?? 0,
    amountOwed: partial.amountOwed,
    cashStillHeld: partial.cashStillHeld,
    cashReturned: partial.cashReturned,
    moneyUnlocked: partial.moneyUnlocked,
    periodFrozen: partial.periodFrozen,
    sealBroken: partial.sealBroken,
  };
}

describe('receiptBlockReason', () => {
  it('does not block open weeks (receipt allowed)', () => {
    expect(
      receiptBlockReason(row({ driverId: 'd1', moneyUnlocked: true })),
    ).toBeNull();
  });

  it('blocks sealBroken', () => {
    expect(
      receiptBlockReason(row({ driverId: 'd1', moneyUnlocked: true, sealBroken: true })),
    ).toBe('Close seal broken — resolve in Close Week');
  });

  it('blocks periodFrozen', () => {
    expect(
      receiptBlockReason(row({ driverId: 'd1', moneyUnlocked: true, periodFrozen: true })),
    ).toBe('Week closed — reopen it in Close Week');
  });

  it('does not block when moneyUnlocked is false', () => {
    expect(receiptBlockReason(row({ driverId: 'd1', moneyUnlocked: false }))).toBeNull();
    expect(receiptBlockReason(row({ driverId: 'd1' }))).toBeNull();
  });

  it('returns null for a clean week', () => {
    expect(
      receiptBlockReason(row({ driverId: 'd1', moneyUnlocked: true, amountOwed: 100 })),
    ).toBeNull();
  });

  it('collectBlockReason aliases receiptBlockReason', () => {
    expect(collectBlockReason(row({ driverId: 'd1', periodFrozen: true }))).toBe(
      receiptBlockReason(row({ driverId: 'd1', periodFrozen: true })),
    );
  });
});

describe('receiptProvisionalHint', () => {
  it('hints when unlocked is false and week is loggable', () => {
    expect(receiptProvisionalHint(row({ driverId: 'd1', moneyUnlocked: false }))).toMatch(
      /provisional/i,
    );
  });

  it('is null when frozen', () => {
    expect(
      receiptProvisionalHint(row({ driverId: 'd1', moneyUnlocked: false, periodFrozen: true })),
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

describe('CashGateError codes (R6-04)', () => {
  it('exposes STALE_RESIDUAL and OVER_COLLECT codes for desk copy', async () => {
    const { CashGateError } = await import('./useCashCollection');
    const stale = new CashGateError(
      'STALE_RESIDUAL',
      '2026-09-01',
      'Balance changed since you loaded this week. Reload and try again.',
    );
    expect(stale.code).toBe('STALE_RESIDUAL');
    expect(stale.message).toMatch(/reload/i);
    const over = new CashGateError('OVER_COLLECT', '2026-09-01', 'Amount exceeds what is owed');
    expect(over.code).toBe('OVER_COLLECT');
  });
});

describe('groupCashDrivers', () => {
  it('includes unlocked=false weeks and excludes only frozen/seal-broken', () => {
    const rows: SettlementQueueRow[] = [
      row({
        driverId: 'kenny',
        driverName: 'Kenny',
        periodAnchor: '2026-09-01',
        periodEnd: '2026-09-07',
        amountOwed: 100,
        moneyUnlocked: false,
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
        driverId: 'locked',
        driverName: 'Locked Fuel',
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
    expect(drivers.map((d: CashDriver) => d.driverId).sort()).toEqual([
      'kenny',
      'locked',
      'open-only',
    ]);
    const kenny = drivers.find((d) => d.driverId === 'kenny')!;
    expect(kenny.totalOwed).toBe(100);
    expect(kenny.weeks).toHaveLength(1);
    expect(kenny.blockedCount).toBe(1);
    expect(drivers.find((d) => d.driverId === 'locked')!.totalOwed).toBe(80);
  });

  it('sorts weeks newest first and drivers by total owed desc', () => {
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
        moneyUnlocked: false,
      }),
    ];
    const drivers = groupCashDrivers(rows);
    expect(drivers.map((d) => d.driverId)).toEqual(['b', 'a']);
    expect(drivers[1].weeks.map((w) => w.periodAnchor)).toEqual(['2026-09-01', '2026-08-25']);
    expect(drivers[1].totalOwed).toBe(30);
  });
});
