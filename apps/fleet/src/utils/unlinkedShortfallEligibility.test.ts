import { describe, it, expect } from 'vitest';
import {
  coversShortfallFully,
  leftoverAfterApply,
  remainingClaimShortfall,
  scoreUnlinkedShortfallMatch,
  isPendingOnlyRefundResolution,
  isUnlinkedApplyResolution,
  isUnlinkedApplySplitState,
  hasBlockingUnlinkedRefund,
  isEligibleUnlinkedShortfallClaim,
  isEligibleUnlinkedShortfallToll,
} from './unlinkedShortfallEligibility';
import { normalizePlatform, platformsEqual } from './normalizePlatform';

describe('unlinked shortfall eligibility', () => {
  it('285 toll / 275 refund → leftover 10, not fully covered for shortfall=285', () => {
    expect(leftoverAfterApply(285, 275)).toBe(10);
    expect(coversShortfallFully(285, 275)).toBe(false);
  });

  it('covers fully when refund >= shortfall', () => {
    expect(coversShortfallFully(10, 10)).toBe(true);
    expect(coversShortfallFully(10, 15)).toBe(true);
    expect(leftoverAfterApply(10, 275)).toBe(0);
  });

  it('remainingClaimShortfall subtracts paidAmount', () => {
    expect(remainingClaimShortfall({ amount: 285, paidAmount: 0 })).toBe(285);
    expect(remainingClaimShortfall({ amount: 285, paidAmount: 275 })).toBe(10);
  });

  it('scores $275 refund near $285 toll highly (picker + recommended)', () => {
    const sameDay = scoreUnlinkedShortfallMatch({
      tripRefund: 275,
      tripDate: '2026-06-29',
      remainingShortfall: 285,
      tollAmount: 285,
      claimOrTollDate: '2026-06-29',
    });
    expect(sameDay).toBeGreaterThanOrEqual(50);

    // Jul 1 Transjam vs Jun 29 Uber credit — still above picker floor
    const nearby = scoreUnlinkedShortfallMatch({
      tripRefund: 275,
      tripDate: '2026-06-29T13:49:00',
      remainingShortfall: 285,
      tollAmount: 285,
      claimOrTollDate: '2026-07-01T18:25:00',
    });
    expect(nearby).toBeGreaterThanOrEqual(25);
  });

  it('pending-only resolution is detected for informational gating', () => {
    expect(isPendingOnlyRefundResolution({ tollRefundResolution: { status: 'pending' } })).toBe(true);
    expect(isPendingOnlyRefundResolution({ tollRefundResolution: { status: 'cash_wash' } })).toBe(false);
    expect(isPendingOnlyRefundResolution({})).toBe(false);
  });

  it('blocks Charge Driver when driver has open unlinked refund', () => {
    expect(
      hasBlockingUnlinkedRefund({
        claimDriverId: 'd1',
        unlinkedTrips: [{ driverId: 'd1', tollCharges: 275 }],
      }),
    ).toBe(true);
    expect(
      hasBlockingUnlinkedRefund({
        claimDriverId: 'd1',
        unlinkedTrips: [{ driverId: 'd1', tollCharges: 275, tollRefundResolution: { status: 'cash_wash' } }],
      }),
    ).toBe(false);
  });

  it('excludes Personal Use / Deadhead Charge Driver and Reimbursed claims from picker', () => {
    expect(
      isEligibleUnlinkedShortfallClaim({
        type: 'Toll_Refund',
        status: 'Resolved',
        resolutionReason: 'Charge Driver',
        amount: 285,
      }),
    ).toBe(false);
    expect(
      isEligibleUnlinkedShortfallClaim({
        type: 'Toll_Refund',
        status: 'Resolved',
        resolutionReason: 'Reimbursed',
        amount: 285,
        expectedAmount: 285,
      }),
    ).toBe(false);
    expect(
      isEligibleUnlinkedShortfallClaim({
        type: 'Toll_Refund',
        status: 'Open',
        amount: 285,
        paidAmount: 0,
      }),
    ).toBe(true);
  });

  it('excludes personal/deadhead ledger rows; keeps underpaid AMOUNT_VARIANCE (Usage or usage)', () => {
    expect(
      isEligibleUnlinkedShortfallToll({
        type: 'usage',
        amount: 285,
        workflowStage: 'personal_use_resolved',
        matchTypeCode: null,
      }),
    ).toBe(false);
    expect(
      isEligibleUnlinkedShortfallToll({
        type: 'Usage',
        amount: 380,
        workflowStage: 'deadhead_resolved',
        resolution: 'personal',
      }),
    ).toBe(false);
    expect(
      isEligibleUnlinkedShortfallToll({
        type: 'Usage', // merged API shape
        amount: 285,
        matchTypeCode: 'AMOUNT_VARIANCE',
        workflowStage: 'underpaid_pending',
      }),
    ).toBe(true);
    expect(
      isEligibleUnlinkedShortfallToll({
        type: 'usage',
        amount: 285,
        matchTypeCode: 'AMOUNT_VARIANCE',
        workflowStage: 'underpaid_pending',
      }),
    ).toBe(true);
  });

  it('detects Apply-to-Underpaid resolutions for undo routing', () => {
    expect(
      isUnlinkedApplyResolution({
        tollRefundResolution: {
          status: 'expense_logged',
          appliedToClaimId: 'claim-1',
        },
      }),
    ).toBe(true);
    expect(
      isUnlinkedApplyResolution({
        tollRefundResolution: {
          status: 'expense_logged',
          source: 'system:unlinked_shortfall:abc',
        },
      }),
    ).toBe(true);
    expect(
      isUnlinkedApplyResolution({
        tollRefundResolution: { status: 'expense_logged', source: 'admin' },
      }),
    ).toBe(false);
    expect(
      isUnlinkedApplyResolution({
        tollRefundResolution: { status: 'cash_wash' },
      }),
    ).toBe(false);
  });

  it('detects split state: pending trip + reimbursed claim', () => {
    expect(
      isUnlinkedApplySplitState(
        { unlinkedTripId: 't1', status: 'Resolved', resolutionReason: 'Reimbursed' },
        { id: 't1', tollRefundResolution: { status: 'pending' } },
      ),
    ).toBe(true);
    expect(
      isUnlinkedApplySplitState(
        { unlinkedTripId: 't1', status: 'Resolved', resolutionReason: 'Reimbursed' },
        { id: 't1', tollRefundResolution: { status: 'expense_logged' } },
      ),
    ).toBe(false);
  });

  it('normalizes platforms for mismatch comparisons', () => {
    expect(normalizePlatform('GoRide')).toBe('Roam');
    expect(normalizePlatform('uber')).toBe('Uber');
    expect(platformsEqual('Uber', 'uber')).toBe(true);
    expect(platformsEqual('Uber', 'Roam')).toBe(false);
    expect(platformsEqual('GoRide', 'Roam')).toBe(true);
  });
});
