/**
 * Regression: May 25–31 looked "complete" in the wizard while the period list
 * still showed 2 open cash tolls. Two failure modes:
 * 1) Trip dump missing the suggested trip → underpaid rows vanished from Finish.
 * 2) Unlinked apply already spent the trip credit → leftover looked fully covered.
 */
import { describe, it, expect } from 'vitest';
import { resolveWizardBucket } from './tollBucket';
import { computeUnderpaidPipelineCounts } from './underpaidPipelineCounts';
import { resolvePendingUnderpaidTrip } from './pendingUnderpaidListable';
import { spentUnlinkedCreditsByTripId, buildTripRefundAllocation } from './tollReconciliation';
import { filterTollsToWizardPeriod } from './tollWeekPeriod';
import { STEP_ORDER, computeStepCounts } from './tollPeriodGating';

const FLEET_TZ = 'America/Jamaica';
const PERIOD = '2026-05-25';

const tx1: any = {
  id: 'f7b476b3', date: '2026-05-27', time: '08:10:00', amount: -285,
  paymentMethod: 'Cash', receiptUrl: 'x', isReconciled: false, tripId: null,
  matchedTripId: null, matchTypeCode: null, isAmbiguous: false, status: 'Pending',
};
const tx2: any = {
  id: 'f267342a', date: '2026-05-27', time: '09:33:00', amount: -285,
  paymentMethod: 'Cash', receiptUrl: 'x', isReconciled: false, tripId: null,
  matchedTripId: null, matchTypeCode: null, isAmbiguous: false, status: 'Pending',
};

const tripB: any = { id: 'b2e3175e', date: '2026-05-27T12:05:29.000Z', tollCharges: 0, platform: 'Uber', driverId: 'd1' };
const tripC: any = { id: 'c3307854', date: '2026-05-27T13:48:50.000Z', tollCharges: 350, platform: 'Uber', driverId: 'd1' };

const best1: any = { matchType: 'AMOUNT_VARIANCE', reasonCode: 'ON_TRIP', confidence: 'high', varianceAmount: -285, trip: tripB, isAmbiguous: false };
const best2: any = { matchType: 'AMOUNT_VARIANCE', reasonCode: 'ON_TRIP', confidence: 'high', varianceAmount: 65, trip: { ...tripC }, isAmbiguous: false };

const suggestions = new Map<string, any[]>([
  ['f7b476b3', [best1]],
  ['f267342a', [best2]],
]);

const reconSpent: any = {
  id: '807bc43b', date: '2026-05-28', time: '09:08:00', amount: -380,
  isReconciled: true, tripId: 'other-trip', unlinkedSourceTripId: 'c3307854',
  workflowStage: 'personal_use_resolved',
};
const claims: any[] = [
  {
    id: 'claim-178', transactionId: '807bc43b', status: 'Resolved',
    resolutionReason: 'Charge Driver', amount: 20, paidAmount: 360,
    unlinkedTripId: 'c3307854', date: '2026-05-28', type: 'Toll_Refund',
    resolutionTransactionId: 'rt2',
  },
];
const disputeRefunds: any[] = [
  { id: 'dr1', matchedTollId: '807bc43b', amount: 10, status: 'auto_resolved' },
];

describe('May 25-31 finish gating regression', () => {
  it('suggestion stub recovers trip when trips dump omitted the row', () => {
    expect(resolvePendingUnderpaidTrip(tx2, new Map(), suggestions)?.id).toBe('c3307854');
    expect(resolvePendingUnderpaidTrip(tx2, new Map(), suggestions)?.tollCharges).toBe(350);
  });

  it('spent unlinked credits remove already-applied trip pool', () => {
    const spent = spentUnlinkedCreditsByTripId({ claims, disputeRefunds, tolls: [reconSpent] });
    expect(spent.get('c3307854')).toBe(350);
    const alloc = buildTripRefundAllocation(
      [{ id: 'pending', tripId: 'c3307854', date: '2026-05-27', time: '09:33:00', amount: -285 }],
      new Map([['c3307854', tripC]]),
      spent,
    );
    expect(alloc.get('pending')).toBe(0);
  });

  it('Finish stays blocked when trips dump is empty but suggestions exist', () => {
    expect(resolveWizardBucket(tx1, best1)).toBe('underpaid');
    expect(resolveWizardBucket(tx2, best2)).toBe('underpaid');

    const pendingUnderpaid = filterTollsToWizardPeriod([tx1, tx2], PERIOD, FLEET_TZ);
    const counts = computeUnderpaidPipelineCounts({
      reconciledTolls: [reconSpent],
      periodClaims: claims,
      allClaims: claims,
      trips: [], // dump omitted the suggested trips
      disputeRefunds,
      periodWeekKey: PERIOD,
      fleetTz: FLEET_TZ,
      pendingUnderpaidTolls: pendingUnderpaid,
      suggestions,
    });
    expect(counts.actionable).toBeGreaterThanOrEqual(2);

    const stepCounts = computeStepCounts({
      classified: {
        'needs-review': [],
        'personal-use': [],
        deadhead: [],
        underpaid: pendingUnderpaid,
      },
      underpaidClaims: claims,
      disputeRefunds,
      unclaimedRefundTrips: [],
      underpaidPipeline: { actionable: counts.actionable, informational: counts.informational },
      periodWeekKey: PERIOD,
      fleetTz: FLEET_TZ,
    });
    const actionableTotal = STEP_ORDER.reduce((sum, id) => sum + (stepCounts[id]?.actionable || 0), 0);
    expect(actionableTotal).toBeGreaterThan(0);
  });
});
