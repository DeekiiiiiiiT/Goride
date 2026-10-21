import { describe, it, expect } from 'vitest';
import {
  coversShortfallFully,
  leftoverAfterApply,
  remainingClaimShortfall,
  scoreUnlinkedShortfallMatch,
  isPendingOnlyRefundResolution,
  isUnlinkedRefundActionableNow,
  isUnlinkedApplyResolution,
  isUnlinkedApplySplitState,
  hasBlockingUnlinkedRefund,
  isEligibleUnlinkedShortfallClaim,
  isEligibleUnlinkedShortfallToll,
  isRecommendedUnlinkedShortfall,
  isUnlinkedShortfallPlatformMismatch,
  hasMaterialExcessRefund,
  proposeUnlinkedPoolAllocation,
  filterSameWeekUnlinkedShortfalls,
  platformRefundForShortfall,
  openTagTollsCanAbsorbCredit,
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

  it('remainingClaimShortfall prefers expectedAmount − paid after partial unlinked apply', () => {
    // Apply path rewrites amount → leftover ($10) and paidAmount → cumulative credits.
    expect(
      remainingClaimShortfall({
        expectedAmount: 285,
        amount: 10,
        paidAmount: 275,
      }),
    ).toBe(10);
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

  it('filterSameWeekUnlinkedShortfalls drops next-week underpaids', () => {
    const TZ = 'America/Jamaica';
    const kept = filterSameWeekUnlinkedShortfalls(
      '2026-01-28T12:00:00.000Z',
      [
        { date: '2026-01-30', tollId: 'same' },
        { date: '2026-02-02', tollId: 'next' },
        { date: '2026-02-07', tollId: 'later' },
      ],
      TZ,
    );
    expect(kept.map((c) => c.tollId)).toEqual(['same']);
  });

  it('pending-only resolution is detected; pending-hold is actionable (decision A)', () => {
    expect(isPendingOnlyRefundResolution({ tollRefundResolution: { status: 'pending' } })).toBe(true);
    expect(isPendingOnlyRefundResolution({ tollRefundResolution: { status: 'cash_wash' } })).toBe(false);
    expect(isPendingOnlyRefundResolution({})).toBe(false);
    expect(isUnlinkedRefundActionableNow({ tollRefundResolution: { status: 'pending' } })).toBe(true);
    expect(isUnlinkedRefundActionableNow({ tollRefundResolution: null })).toBe(true);
    expect(isUnlinkedRefundActionableNow({ tollRefundResolution: { status: 'cash_wash' } })).toBe(false);
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
    // Unlinked-first: needs_review / matched can still receive a trip credit
    expect(
      isEligibleUnlinkedShortfallToll({
        type: 'usage',
        amount: 380,
        workflowStage: 'needs_review',
      }),
    ).toBe(true);
    expect(
      isEligibleUnlinkedShortfallToll({
        type: 'usage',
        amount: 380,
        workflowStage: 'matched',
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

  it('recommended badge only when confidence high and platforms match', () => {
    const highMatch = {
      confidence: 97,
      tripPlatform: 'Uber',
      tollPlatform: 'Uber',
      platformMismatch: false,
      tripRefund: 275,
      remainingShortfall: 285,
    };
    const mismatch = {
      confidence: 97,
      tripPlatform: 'Uber',
      tollPlatform: 'Roam',
      platformMismatch: true,
      tripRefund: 275,
      remainingShortfall: 285,
    };
    expect(isRecommendedUnlinkedShortfall(highMatch)).toBe(true);
    expect(isRecommendedUnlinkedShortfall(mismatch)).toBe(false);
    expect(isUnlinkedShortfallPlatformMismatch(mismatch)).toBe(true);
    expect(isUnlinkedShortfallPlatformMismatch(highMatch)).toBe(false);
  });

  it('hasMaterialExcessRefund detects multi-plaza leftover', () => {
    expect(hasMaterialExcessRefund(645, 380)).toBe(true);
    expect(hasMaterialExcessRefund(275, 285)).toBe(false);
    expect(hasMaterialExcessRefund(370, 380)).toBe(false);
  });

  it('proposeUnlinkedPoolAllocation splits $645 across $285 + $380', () => {
    const shares = proposeUnlinkedPoolAllocation(645, [
      { tollId: 't380', remainingShortfall: 380, date: '2026-06-30T18:00:00' },
      { tollId: 't285', remainingShortfall: 285, date: '2026-06-30T12:00:00' },
    ]);
    expect(shares.map((s) => s.tollId)).toEqual(['t285', 't380']);
    expect(shares[0].proposedShare).toBe(285);
    expect(shares[1].proposedShare).toBe(360);
  });

  // Kenny Oct 15: Uber $645 soft-matched to Spanish Town East $275 + Portmore East $370
  describe('Kenny-shaped multi-plaza shortfall', () => {
    const tripId = 'kenny-645';
    const unresolvedTrip = {
      id: tripId,
      tollCharges: 645,
      tollRefundResolution: { status: 'pending' as const },
    };

    it('soft match to unresolved trip does not net full $645 (remaining stays open)', () => {
      const softToll370 = {
        matchedTripId: tripId,
        tripId: null as string | null,
        status: 'pending',
      };
      expect(platformRefundForShortfall({ toll: softToll370, trip: unresolvedTrip })).toBe(0);
      // Live remaining = expected − platformRefund = 370 − 0
      expect(370 - platformRefundForShortfall({ toll: softToll370, trip: unresolvedTrip })).toBe(370);

      const softToll275 = { matchedTripId: tripId, status: 'pending' };
      expect(platformRefundForShortfall({ toll: softToll275, trip: unresolvedTrip })).toBe(0);
      expect(275 - 0).toBe(275);
    });

    it('soft match to resolved / expense_logged trip still nets (regression)', () => {
      const softToll = { matchedTripId: tripId, status: 'pending' };
      expect(
        platformRefundForShortfall({
          toll: softToll,
          trip: {
            ...unresolvedTrip,
            tollRefundResolution: { status: 'expense_logged' },
          },
        }),
      ).toBe(645);
      expect(
        platformRefundForShortfall({
          toll: softToll,
          trip: {
            ...unresolvedTrip,
            tollRefundResolution: { status: 'cash_wash' },
          },
        }),
      ).toBe(645);
    });

    it('hard tripId reconciled still nets full charges', () => {
      expect(
        platformRefundForShortfall({
          toll: { tripId, matchedTripId: tripId, status: 'reconciled' },
          trip: unresolvedTrip,
        }),
      ).toBe(645);
    });

    it('pool $645 → shares $275 + $370, multi-target leftover $0', () => {
      expect(hasMaterialExcessRefund(645, 370)).toBe(true);
      const shares = proposeUnlinkedPoolAllocation(645, [
        { tollId: 'portmore', remainingShortfall: 370, date: '2026-10-15T14:00:00' },
        { tollId: 'spanish', remainingShortfall: 275, date: '2026-10-15T10:00:00' },
      ]);
      expect(shares[0].tollId).toBe('spanish');
      expect(shares[0].proposedShare).toBe(275);
      expect(shares[1].tollId).toBe('portmore');
      expect(shares[1].proposedShare).toBe(370);
      const leftover =
        645 - shares.reduce((s, x) => s + x.proposedShare, 0);
      expect(leftover).toBe(0);
      // Same rule annotateUnlinkedPoolSuggestions uses for requiresMultiTarget
      expect(shares.filter((s) => s.proposedShare > 0.05).length).toBeGreaterThanOrEqual(2);
    });

    it('openTagTollsCanAbsorbCredit true when soft-matched plazas exist', () => {
      expect(
        openTagTollsCanAbsorbCredit({
          tripId,
          tripRefund: 645,
          openSameDriverWeekTolls: [
            { amount: 275, matchedTripId: tripId },
            { amount: 370, matchedTripId: tripId },
          ],
        }),
      ).toBe(true);
      expect(
        openTagTollsCanAbsorbCredit({
          tripId,
          tripRefund: 645,
          openSameDriverWeekTolls: [],
        }),
      ).toBe(false);
    });
  });

  it('recommended shortcut hidden for multi-target or material excess full dump', () => {
    expect(
      isRecommendedUnlinkedShortfall({
        confidence: 69,
        tripPlatform: 'Uber',
        tollPlatform: 'Uber',
        platformMismatch: false,
        requiresMultiTarget: true,
        tripRefund: 645,
        remainingShortfall: 380,
        proposedShare: 360,
      }),
    ).toBe(false);

    expect(
      isRecommendedUnlinkedShortfall({
        confidence: 69,
        tripPlatform: 'Uber',
        tollPlatform: 'Uber',
        platformMismatch: false,
        tripRefund: 645,
        remainingShortfall: 380,
        // proposedShare equals full refund → dumping all on one shortfall
        proposedShare: 645,
      }),
    ).toBe(false);
  });

  it('recommended shortcut hidden when share is a tiny slice of a large credit', () => {
    // $370 credit vs $10 leftover — applying $10 would strand $360 and consume
    // a shortfall a dispute refund should settle. Must route to Review.
    expect(
      isRecommendedUnlinkedShortfall({
        confidence: 97,
        tripPlatform: 'Uber',
        tollPlatform: 'Uber',
        platformMismatch: false,
        tripRefund: 370,
        remainingShortfall: 10,
        proposedShare: 10,
      }),
    ).toBe(false);
  });
});
