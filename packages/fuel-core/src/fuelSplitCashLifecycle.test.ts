import { describe, expect, it } from 'vitest';
import {
  AWAITING_CASH_STALE_DAYS,
  assertSplitCashInvariant,
  classifySplitCashState,
  closeCardCoveredSplitCash,
  daysAwaitingCash,
  isStaleAwaitingCash,
  resolveSplitCashAcceptDerived,
  resolveSplitCashFromStatement,
  resolveSplitCashManual,
  resolveSplitCashVoid,
  stampCashRehomed,
  splitPumpPriceOutlierPatch,
  describeSplitCashRehome,
  describeSplitCashRehomeBlocked,
  classifySplitCashPeriodLanding,
} from './fuelSplitCashLifecycle';

describe('split cash guardian resolve paths', () => {
  const baseMeta = {
    fillGroupId: 'fg-1',
    splitRole: 'cash',
    awaitingCashStatement: true,
    splitVariance: true,
    splitDerivedCashAmount: 2400,
    splitPumpTotal: 5400,
  };

  it('accept derived clears awaiting and sets Pending amount', () => {
    const patch = resolveSplitCashAcceptDerived(baseMeta, 2400);
    expect(patch.amount).toBe(-2400);
    expect(patch.status).toBe('Pending');
    expect(patch.metadata.awaitingCashStatement).toBe(false);
    expect(patch.metadata.splitReconciled).toBe(true);
    expect(patch.metadata.splitCashResolveAction).toBe('accept_derived');
  });

  it('manual cash requires reason and clears awaiting', () => {
    expect(() => resolveSplitCashManual(baseMeta, 2000, {})).toThrow('split_cash_reason_required');
    const patch = resolveSplitCashManual(baseMeta, 2000, { reason: 'Driver receipt shows 2000' });
    expect(patch.amount).toBe(-2000);
    expect(patch.metadata.awaitingCashStatement).toBe(false);
    expect(patch.metadata.splitReconciled).toBe(true);
    expect(patch.metadata.splitManualCashAmount).toBe(2000);
  });

  it('void requires reason and never leaves awaiting', () => {
    const patch = resolveSplitCashVoid(baseMeta, { reason: 'Statement never matched card' });
    expect(patch.amount).toBe(0);
    expect(patch.status).toBe('Rejected');
    expect(patch.metadata.awaitingCashStatement).toBe(false);
    expect(patch.metadata.splitCashVoided).toBe(true);
  });

  it('card covered full closes without Pending queue noise', () => {
    const patch = closeCardCoveredSplitCash(baseMeta);
    expect(patch.amount).toBe(0);
    expect(patch.status).toBe('Rejected');
    expect(patch.metadata.splitCardCoveredFull).toBe(true);
    expect(patch.metadata.awaitingCashStatement).toBe(false);
  });

  it('statement derived with $0 uses card_covered_full', () => {
    const patch = resolveSplitCashFromStatement(baseMeta, 0);
    expect(patch.metadata.splitCardCoveredFull).toBe(true);
    expect(patch.metadata.awaitingCashStatement).toBe(false);
  });

  it('makes reconciled+awaiting unrepresentable', () => {
    const bad = assertSplitCashInvariant({
      splitReconciled: true,
      awaitingCashStatement: true,
    });
    expect(bad.awaitingCashStatement).toBe(false);
    expect(bad.splitReconciled).toBe(true);
  });

  it('stamps re-home provenance', () => {
    const meta = stampCashRehomed(
      { fillGroupId: 'fg-1' },
      {
        originalFillDate: '2026-09-01',
        fromWeekKey: '2026-08-31',
        toWeekKey: '2026-09-14',
        toDateYmd: '2026-09-14',
      },
    );
    expect(meta.originalFillDate).toBe('2026-09-01');
    expect(meta.cashRehomedFromWeek).toBe('2026-08-31');
    expect(meta.cashRehomedToWeek).toBe('2026-09-14');
  });
});

describe('aging', () => {
  it('marks awaiting stale at 14 days', () => {
    const tx = {
      date: '2026-09-01',
      status: 'Pending',
      amount: 0,
      metadata: {
        fillGroupId: 'fg-1',
        splitRole: 'cash',
        awaitingCashStatement: true,
      },
    };
    const now = new Date('2026-09-20T12:00:00Z');
    expect(daysAwaitingCash(tx, now)).toBe(19);
    expect(isStaleAwaitingCash(tx, now, AWAITING_CASH_STALE_DAYS)).toBe(true);
    expect(classifySplitCashState(tx, now)).toBe('stale');
  });

  it('fresh awaiting is not stale', () => {
    const tx = {
      date: '2026-09-18',
      metadata: {
        fillGroupId: 'fg-1',
        splitRole: 'cash',
        awaitingCashStatement: true,
      },
    };
    const now = new Date('2026-09-20T12:00:00Z');
    expect(classifySplitCashState(tx, now)).toBe('awaiting');
  });
});

describe('price band (M4)', () => {
  it('flags material pump $/L outlier', () => {
    const patch = splitPumpPriceOutlierPatch({
      pumpTotal: 8400,
      pumpLiters: 20,
      retailEstimateJmd: 200,
    });
    // 8400/20 = 420 vs 200 → 110% over → outlier
    expect(patch.splitPumpPriceOutlier).toBe(true);
    expect(patch.splitPumpImpliedPerLiter).toBe(420);
  });

  it('does not flag within band', () => {
    const patch = splitPumpPriceOutlierPatch({
      pumpTotal: 4200,
      pumpLiters: 20,
      retailEstimateJmd: 200,
    });
    expect(patch.splitPumpPriceOutlier).toBe(false);
  });

  it('does not false-positive when using full pump liters (not statement portion)', () => {
    // Audit §9.5: pump $10k / 50 L at $200 retail — normal fill; card may report ~30 L
    const correct = splitPumpPriceOutlierPatch({
      pumpTotal: 10000,
      pumpLiters: 50,
      retailEstimateJmd: 200,
    });
    expect(correct.splitPumpPriceOutlier).toBe(false);

    const wrongStmtLiters = splitPumpPriceOutlierPatch({
      pumpTotal: 10000,
      pumpLiters: 30,
      retailEstimateJmd: 200,
    });
    expect(wrongStmtLiters.splitPumpPriceOutlier).toBe(true);
  });

  it('skips flag when pump liters unknown', () => {
    expect(
      splitPumpPriceOutlierPatch({
        pumpTotal: 10000,
        pumpLiters: 0,
        retailEstimateJmd: 200,
      }).splitPumpPriceOutlier,
    ).toBe(false);
  });
});

describe('rehome / blocked copy', () => {
  it('describes rehome and blocked reasons', () => {
    expect(
      describeSplitCashRehome({
        originalFillDate: '2026-09-01',
        cashRehomedFromWeek: '2026-08-31',
        cashRehomedToWeek: '2026-09-14',
      }),
    ).toBe('Moved from fill 2026-09-01 (week 2026-08-31)');

    expect(
      describeSplitCashRehomeBlocked({
        splitCashRehomeBlocked: true,
        splitCashRehomeBlockedReason: 'no_open_period',
      }),
    ).toMatch(/No open week/);

    expect(
      describeSplitCashRehomeBlocked({
        splitCashRehomeBlocked: true,
        splitCashRehomeBlockedReason: 'missing_identity',
      }),
    ).toMatch(/missing driver/);
  });
});

describe('classifySplitCashPeriodLanding', () => {
  it('fails closed when identity missing', () => {
    const plan = classifySplitCashPeriodLanding({
      orgId: '',
      driverId: 'd1',
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

  it('rehomes when sealed with open target', () => {
    const plan = classifySplitCashPeriodLanding({
      orgId: 'org',
      driverId: 'd1',
      fillWeekKey: '2026-08-31',
      originalFillDate: '2026-09-01',
      fillWeekSealed: true,
      openTargetWeek: '2026-09-14',
    });
    expect(plan).toEqual({
      action: 'rehome',
      fillWeekKey: '2026-08-31',
      originalFillDate: '2026-09-01',
      toWeekKey: '2026-09-14',
      toDateYmd: '2026-09-14',
    });
  });

  it('blocks when sealed with no open target', () => {
    const plan = classifySplitCashPeriodLanding({
      orgId: 'org',
      driverId: 'd1',
      fillWeekKey: '2026-08-31',
      originalFillDate: '2026-09-01',
      fillWeekSealed: true,
      openTargetWeek: null,
    });
    expect(plan.action).toBe('blocked_no_open_target');
    if (plan.action === 'blocked_no_open_target') {
      expect(plan.blockedReason).toBe('no_open_period');
    }
  });
});
