import { describe, expect, it } from 'vitest';
import {
  countFuelReviewQueueWork,
  isAdminManualFuelWithProvidedOdometer,
  isLedgerFuelExpenseRow,
  isLogReviewEligible,
  isPendingFuelQueueRow,
  isPendingReadyForReview,
  isStationGateHeld,
  isUnresolvedSplitVariance,
  acknowledgeSplitVarianceMeta,
  listUnapprovedFuelTxInWindow,
  type FuelReviewQueueTx,
} from './fuelReviewQueue';

function tx(partial: Partial<FuelReviewQueueTx> & { id: string }): FuelReviewQueueTx {
  return {
    status: 'Pending',
    type: 'Expense',
    category: 'Fuel',
    paymentMethod: 'Cash',
    date: '2026-09-15',
    amount: 100,
    ...partial,
  };
}

describe('isPendingFuelQueueRow', () => {
  it('accepts driver cash fuel Pending', () => {
    expect(isPendingFuelQueueRow(tx({ id: '1' }))).toBe(true);
  });

  it('rejects Approved', () => {
    expect(isPendingFuelQueueRow(tx({ id: '1', status: 'Approved' }))).toBe(false);
  });

  it('rejects non-fuel category', () => {
    expect(isPendingFuelQueueRow(tx({ id: '1', category: 'Toll' }))).toBe(false);
  });
});

describe('station hold + log review', () => {
  it('detects station gate hold', () => {
    expect(isStationGateHeld(tx({ id: '1', metadata: { stationGateHold: true } }))).toBe(true);
    expect(isStationGateHeld(tx({ id: '2', metadata: { stationGateHold: 'true' } }))).toBe(true);
  });

  it('excludes station holds from log review and ready', () => {
    const held = tx({ id: '1', metadata: { stationGateHold: true, needsLogReview: true } });
    expect(isLogReviewEligible(held)).toBe(false);
    expect(isPendingReadyForReview(held)).toBe(false);
    expect(isPendingFuelQueueRow(held)).toBe(true);
  });

  it('flags needsLogReview or non-ai odometer', () => {
    expect(isLogReviewEligible(tx({ id: '1', metadata: { needsLogReview: true } }))).toBe(true);
    expect(isLogReviewEligible(tx({ id: '2', metadata: { odometerMethod: 'manual' } }))).toBe(true);
    expect(
      isLogReviewEligible(tx({ id: '3', metadata: { odometerMethod: 'ai_verified' } })),
    ).toBe(false);
  });

  it('admin manual with odometer skips log review', () => {
    const admin = tx({
      id: '1',
      odometer: 12000,
      metadata: { entrySource: 'admin-manual', odometerMethod: 'manual' },
    });
    expect(isAdminManualFuelWithProvidedOdometer(admin)).toBe(true);
    expect(isLogReviewEligible(admin)).toBe(false);
    expect(isPendingReadyForReview(admin)).toBe(true);
  });
});

describe('isLedgerFuelExpenseRow', () => {
  it('matches Approved Expense fuel category', () => {
    expect(
      isLedgerFuelExpenseRow(
        tx({ id: '1', status: 'Approved', type: 'Expense', category: 'Fuel' }),
      ),
    ).toBe(true);
  });

  it('rejects non-Expense', () => {
    expect(isLedgerFuelExpenseRow(tx({ id: '1', type: 'Reimbursement' }))).toBe(false);
  });
});

describe('listUnapprovedFuelTxInWindow', () => {
  it('includes Pending in window and excludes out-of-window', () => {
    const rows = [
      tx({ id: 'in', date: '2026-09-16' }),
      tx({ id: 'out', date: '2026-09-01' }),
      tx({ id: 'approved', date: '2026-09-16', status: 'Approved' }),
    ];
    const blockers = listUnapprovedFuelTxInWindow(rows, '2026-09-14', '2026-09-20');
    expect(blockers.map((b) => b.id)).toEqual(['in']);
    expect(blockers[0].holdReason).toBe('log_review');
  });

  it('labels station_hold vs pending_review', () => {
    const held = tx({
      id: 'h',
      date: '2026-09-15',
      metadata: { stationGateHold: true, odometerMethod: 'ai_verified' },
    });
    const ready = tx({
      id: 'r',
      date: '2026-09-15',
      odometer: 5000,
      metadata: { entrySource: 'admin-manual', odometerMethod: 'manual' },
    });
    const blockers = listUnapprovedFuelTxInWindow([held, ready], '2026-09-14', '2026-09-20');
    expect(blockers.find((b) => b.id === 'h')?.holdReason).toBe('station_hold');
    expect(blockers.find((b) => b.id === 'r')?.holdReason).toBe('pending_review');
  });
});

describe('countFuelReviewQueueWork', () => {
  it('counts unique work without double-counting log review in pendingReady', () => {
    const rows = [
      tx({ id: 'lr', metadata: { needsLogReview: true } }),
      tx({
        id: 'ready',
        odometer: 100,
        metadata: { entrySource: 'admin-manual', odometerMethod: 'ai_verified' },
      }),
      tx({ id: 'hold', metadata: { stationGateHold: true } }),
    ];
    const c = countFuelReviewQueueWork(rows);
    expect(c.logReview).toBe(1);
    expect(c.pendingReady).toBe(1);
    expect(c.splitVariance).toBe(0);
    expect(c.total).toBe(2);
  });

  it('counts unresolved split variance', () => {
    const rows = [
      tx({
        id: 'split',
        metadata: {
          fillGroupId: 'fg-1',
          splitVariance: true,
          splitReconciled: false,
        },
      }),
    ];
    const c = countFuelReviewQueueWork(rows);
    expect(c.splitVariance).toBe(1);
    expect(c.total).toBeGreaterThanOrEqual(1);
  });

  it('excludes awaiting-cash statement from pending ready and finalize blockers', () => {
    const awaiting = tx({
      id: 'await',
      amount: 0,
      metadata: {
        fillGroupId: 'fg-1',
        splitRole: 'cash',
        awaitingCashStatement: true,
      },
    });
    expect(isPendingReadyForReview(awaiting)).toBe(false);
    expect(listUnapprovedFuelTxInWindow([awaiting], '2026-09-01', '2026-09-30')).toHaveLength(0);
  });

  it('drops split variance from count after acknowledge', () => {
    const open = tx({
      id: 'split',
      metadata: {
        fillGroupId: 'fg-1',
        splitVariance: true,
      },
    });
    expect(isUnresolvedSplitVariance(open)).toBe(true);
    const closed = {
      ...open,
      metadata: acknowledgeSplitVarianceMeta(open.metadata),
    };
    expect(isUnresolvedSplitVariance(closed)).toBe(false);
    expect(countFuelReviewQueueWork([closed]).splitVariance).toBe(0);
  });
});
