import { describe, expect, it } from 'vitest';
import {
  resolveSplitCashFromStatement,
  stampCashRehomed,
  assertSplitCashInvariant,
  isPendingReadyForReview,
  classifySplitCashPeriodLanding,
  describeSplitCashRehome,
} from './index';

/**
 * Cross-subsystem sequence the audit said was missing:
 * create awaiting → week sealed → import statement → assert money landing.
 * Pure helpers mirror persistFuelMatchPair outcomes (write_in_place / rehome / blocked).
 */
describe('split cash re-home sequence (C1)', () => {
  it('write_in_place when fill week open — date stays, amount set, pending-ready', () => {
    const fillDate = '2026-09-15';
    const plan = classifySplitCashPeriodLanding({
      orgId: 'org',
      driverId: 'd1',
      fillWeekKey: '2026-09-14',
      originalFillDate: fillDate,
      fillWeekSealed: false,
      openTargetWeek: null,
    });
    expect(plan.action).toBe('write_in_place');

    const money = resolveSplitCashFromStatement(
      {
        fillGroupId: 'fg-open',
        splitRole: 'cash',
        awaitingCashStatement: true,
        splitPumpTotal: 5400,
      },
      2400,
    );
    const landed = {
      id: 'cash-open',
      date: fillDate,
      status: money.status || 'Pending',
      amount: money.amount,
      type: 'Expense',
      category: 'Fuel',
      paymentMethod: 'RideShare Cash',
      odometer: 12000,
      metadata: {
        ...assertSplitCashInvariant(money.metadata),
        entrySource: 'admin-manual',
        odometerMethod: 'manual',
      },
    };
    expect(landed.amount).toBe(-2400);
    expect(landed.date).toBe(fillDate);
    expect(landed.metadata.awaitingCashStatement).toBe(false);
    expect(isPendingReadyForReview(landed)).toBe(true);
  });

  it('rehome when sealed — tx.date moves, originalFillDate preserved, pending-ready', () => {
    const fillDate = '2026-09-01';
    const plan = classifySplitCashPeriodLanding({
      orgId: 'org',
      driverId: 'd1',
      fillWeekKey: '2026-08-31',
      originalFillDate: fillDate,
      fillWeekSealed: true,
      openTargetWeek: '2026-09-14',
    });
    expect(plan.action).toBe('rehome');
    if (plan.action !== 'rehome') return;

    const money = resolveSplitCashFromStatement(
      {
        fillGroupId: 'fg-seq',
        splitRole: 'cash',
        awaitingCashStatement: true,
        splitPumpTotal: 5400,
      },
      2400,
    );
    const rehomedMeta = stampCashRehomed(assertSplitCashInvariant(money.metadata), {
      originalFillDate: plan.originalFillDate,
      fromWeekKey: plan.fillWeekKey,
      toWeekKey: plan.toWeekKey,
      toDateYmd: plan.toDateYmd,
    });

    const landed = {
      id: 'cash-1',
      date: plan.toDateYmd,
      status: money.status || 'Pending',
      amount: money.amount,
      type: 'Expense',
      category: 'Fuel',
      paymentMethod: 'RideShare Cash',
      odometer: 12000,
      metadata: {
        ...rehomedMeta,
        entrySource: 'admin-manual',
        odometerMethod: 'manual',
      },
    };

    expect(landed.amount).toBe(-2400);
    expect(landed.metadata.awaitingCashStatement).toBe(false);
    expect(landed.metadata.originalFillDate).toBe(fillDate);
    expect(landed.metadata.cashRehomedToWeek).toBe('2026-09-14');
    expect(landed.date).toBe('2026-09-14');
    expect(describeSplitCashRehome(landed.metadata)).toMatch(/Moved from fill/);
    expect(isPendingReadyForReview(landed)).toBe(true);
  });

  it('blocked no open period — amount stays 0, awaiting true, reason stamped', () => {
    const plan = classifySplitCashPeriodLanding({
      orgId: 'org',
      driverId: 'd1',
      fillWeekKey: '2026-08-31',
      originalFillDate: '2026-09-01',
      fillWeekSealed: true,
      openTargetWeek: null,
    });
    expect(plan.action).toBe('blocked_no_open_target');
    if (plan.action !== 'blocked_no_open_target') return;

    const blocked = {
      id: 'cash-blocked',
      date: '2026-09-01',
      status: 'Pending',
      amount: 0,
      type: 'Expense',
      category: 'Fuel',
      paymentMethod: 'RideShare Cash',
      metadata: {
        fillGroupId: 'fg-b',
        splitRole: 'cash',
        awaitingCashStatement: true,
        splitVariance: true,
        splitDerivedCashAmount: 2400,
        splitCashRehomeBlocked: true,
        splitCashRehomeBlockedReason: plan.blockedReason,
        splitCashRehomeBlockedWeek: plan.fillWeekKey,
      },
    };
    expect(blocked.amount).toBe(0);
    expect(blocked.metadata.awaitingCashStatement).toBe(true);
    expect(blocked.metadata.splitCashRehomeBlockedReason).toBe('no_open_period');
    expect(isPendingReadyForReview(blocked)).toBe(false);
  });

  it('blocked missing identity — never write_in_place', () => {
    const plan = classifySplitCashPeriodLanding({
      orgId: '',
      driverId: '',
      fillWeekKey: '2026-08-31',
      originalFillDate: '2026-09-01',
      fillWeekSealed: false,
      openTargetWeek: '2026-09-14',
    });
    expect(plan.action).toBe('blocked_no_open_target');
    if (plan.action === 'blocked_no_open_target') {
      expect(plan.blockedReason).toBe('missing_identity');
    }
  });

  it('card-covered $0 never enters pending-ready', () => {
    const patch = resolveSplitCashFromStatement(
      {
        fillGroupId: 'fg-0',
        splitRole: 'cash',
        awaitingCashStatement: true,
      },
      0,
    );
    const tx = {
      id: 'z',
      status: patch.status || 'Rejected',
      type: 'Expense',
      category: 'Fuel',
      paymentMethod: 'RideShare Cash',
      amount: patch.amount,
      metadata: patch.metadata,
      odometer: 1,
    };
    expect(tx.metadata.splitCardCoveredFull).toBe(true);
    expect(isPendingReadyForReview(tx)).toBe(false);
  });
});
