import { describe, expect, it } from 'vitest';
import {
  applySplitCashMatchToTx,
  classifySplitCashPeriodLanding,
  isPendingReadyForReview,
  describeSplitCashRehome,
  describeSplitCashRehomeBlocked,
} from './index';

/** Mirrors persistFuelMatchPair cash-sibling branch via pure apply (Phase 2 enable gate). */
function baseAwaitingTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cash-tx-1',
    date: '2026-09-01',
    status: 'Pending',
    amount: 0,
    type: 'Expense',
    category: 'Fuel',
    paymentMethod: 'RideShare Cash',
    odometer: 12000,
    metadata: {
      fillGroupId: 'fg-apply',
      splitRole: 'cash',
      awaitingCashStatement: true,
      splitPumpTotal: 10000,
      entrySource: 'admin-manual',
      odometerMethod: 'manual',
    },
    ...overrides,
  };
}

const drvMeta = {
  splitReconciled: true,
  splitDerivedCashAmount: 4000,
  splitStatementAmount: 6000,
  splitPumpTotal: 10000,
};

describe('applySplitCashMatchToTx (persistFuelMatchPair glue)', () => {
  it('write_in_place — amount set, date unchanged, awaiting cleared, pending-ready', () => {
    const plan = classifySplitCashPeriodLanding({
      orgId: 'org',
      driverId: 'd1',
      fillWeekKey: '2026-08-31',
      originalFillDate: '2026-09-01',
      fillWeekSealed: false,
      openTargetWeek: null,
    });
    const result = applySplitCashMatchToTx({
      tx: baseAwaitingTx(),
      plan,
      derivedCashPositive: 4000,
      drvMeta,
      reconciled: true,
    });
    expect(result.outcome).toBe('write_in_place');
    if (result.outcome !== 'write_in_place') return;
    expect(result.tx.amount).toBe(-4000);
    expect(result.tx.date).toBe('2026-09-01');
    expect(result.tx.status).toBe('Pending');
    expect(result.tx.metadata?.awaitingCashStatement).toBe(false);
    expect(result.tx.metadata?.splitReconciled).toBe(true);
    expect(isPendingReadyForReview(result.tx as never)).toBe(true);
    expect(result.fuelEntryAmount).toBe(4000);
  });

  it('rehome — date moves to open week, originalFillDate stamped, pending-ready', () => {
    const plan = classifySplitCashPeriodLanding({
      orgId: 'org',
      driverId: 'd1',
      fillWeekKey: '2026-08-31',
      originalFillDate: '2026-09-01',
      fillWeekSealed: true,
      openTargetWeek: '2026-09-14',
    });
    const result = applySplitCashMatchToTx({
      tx: baseAwaitingTx(),
      plan,
      derivedCashPositive: 4000,
      drvMeta,
      reconciled: true,
    });
    expect(result.outcome).toBe('rehome');
    if (result.outcome !== 'rehome') return;
    expect(result.tx.amount).toBe(-4000);
    expect(result.tx.date).toBe('2026-09-14');
    expect(result.rehomeToWeek).toBe('2026-09-14');
    expect(result.tx.metadata?.originalFillDate).toBe('2026-09-01');
    expect(result.tx.metadata?.cashRehomedFromWeek).toBe('2026-08-31');
    expect(describeSplitCashRehome(result.tx.metadata)).toMatch(/Moved from fill/);
    expect(isPendingReadyForReview(result.tx as never)).toBe(true);
  });

  it('blocked no open period — amount stays 0, sealed date unchanged, never money-write', () => {
    const plan = classifySplitCashPeriodLanding({
      orgId: 'org',
      driverId: 'd1',
      fillWeekKey: '2026-08-31',
      originalFillDate: '2026-09-01',
      fillWeekSealed: true,
      openTargetWeek: null,
    });
    const before = baseAwaitingTx({ amount: 0, date: '2026-09-01' });
    const result = applySplitCashMatchToTx({
      tx: before,
      plan,
      derivedCashPositive: 4000,
      drvMeta,
      reconciled: true,
    });
    expect(result.outcome).toBe('blocked');
    if (result.outcome !== 'blocked') return;
    expect(result.amountMutated).toBe(false);
    expect(result.blockedReason).toBe('no_open_period');
    expect(result.tx.amount).toBe(0);
    expect(result.tx.date).toBe('2026-09-01');
    expect(result.tx.metadata?.awaitingCashStatement).toBe(true);
    expect(result.tx.metadata?.splitCashRehomeBlocked).toBe(true);
    expect(describeSplitCashRehomeBlocked(result.tx.metadata)).toMatch(/No open week/);
    expect(isPendingReadyForReview(result.tx as never)).toBe(false);
  });

  it('blocked missing_identity — never write_in_place even if week looks open', () => {
    const plan = classifySplitCashPeriodLanding({
      orgId: '',
      driverId: '',
      fillWeekKey: '2026-08-31',
      originalFillDate: '2026-09-01',
      fillWeekSealed: false,
      openTargetWeek: '2026-09-14',
    });
    expect(plan.action).toBe('blocked_no_open_target');
    const result = applySplitCashMatchToTx({
      tx: baseAwaitingTx(),
      plan,
      derivedCashPositive: 4000,
      drvMeta,
      reconciled: true,
    });
    expect(result.outcome).toBe('blocked');
    if (result.outcome !== 'blocked') return;
    expect(result.blockedReason).toBe('missing_identity');
    expect(result.amountMutated).toBe(false);
    expect(result.tx.amount).toBe(0);
    expect(describeSplitCashRehomeBlocked(result.tx.metadata)).toMatch(/missing driver/);
  });

  it('card-covered $0 — Rejected, not pending-ready', () => {
    const plan = classifySplitCashPeriodLanding({
      orgId: 'org',
      driverId: 'd1',
      fillWeekKey: '2026-08-31',
      originalFillDate: '2026-09-01',
      fillWeekSealed: false,
      openTargetWeek: null,
    });
    const result = applySplitCashMatchToTx({
      tx: baseAwaitingTx(),
      plan,
      derivedCashPositive: 0,
      drvMeta: { ...drvMeta, splitDerivedCashAmount: 0, splitStatementAmount: 10000 },
      reconciled: true,
    });
    expect(result.outcome).toBe('card_covered');
    if (result.outcome !== 'card_covered') return;
    expect(result.tx.amount).toBe(0);
    expect(result.tx.status).toBe('Rejected');
    expect(result.tx.metadata?.splitCardCoveredFull).toBe(true);
    expect(isPendingReadyForReview(result.tx as never)).toBe(false);
  });

  it('variance (not reconciled) — keeps awaiting, does not invent amount', () => {
    const plan = classifySplitCashPeriodLanding({
      orgId: 'org',
      driverId: 'd1',
      fillWeekKey: '2026-08-31',
      originalFillDate: '2026-09-01',
      fillWeekSealed: false,
      openTargetWeek: null,
    });
    const result = applySplitCashMatchToTx({
      tx: baseAwaitingTx(),
      plan,
      derivedCashPositive: 4000,
      drvMeta: {
        ...drvMeta,
        splitReconciled: false,
        splitVariance: true,
        splitVarianceDelta: 200,
      },
      reconciled: false,
    });
    expect(result.outcome).toBe('skipped_not_reconciled');
    expect(result.tx.amount).toBe(0);
    expect(result.tx.metadata?.awaitingCashStatement).toBe(true);
    expect(result.tx.metadata?.splitVariance).toBe(true);
    expect(isPendingReadyForReview(result.tx as never)).toBe(false);
  });
});
