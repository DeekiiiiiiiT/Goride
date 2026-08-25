import { describe, it, expect } from 'vitest';
import {
  computePeriodCounts,
  incrementLandingUnclaimedTollCount,
  incrementUnlinkedRefundCount,
} from './tollPeriodCounts';
import { classifyTollReconPeriodStatus } from './tollReconPeriodStatus';
import type { StepId } from './tollPeriodGating';

const emptyClassified = {
  'needs-review': [],
  'personal-use': [],
  deadhead: [],
  underpaid: [],
};

function zeroCounts(): Record<StepId, { actionable: number; informational: number }> {
  return {
    'needs-review': { actionable: 0, informational: 0 },
    'personal-use': { actionable: 0, informational: 0 },
    deadhead: { actionable: 0, informational: 0 },
    'underpaid-claims': { actionable: 0, informational: 0 },
    'dispute-refunds': { actionable: 0, informational: 0 },
    'unlinked-refunds': { actionable: 0, informational: 0 },
  };
}

/** Mar 9–15 ghost trip: linked toll, trip credit never closed. */
const GHOST_TRIP: any = {
  id: 'ea510908-b6e7-4a49-9e18-14641d0d4fe5',
  date: '2026-03-14T15:00:00.000Z',
  tollCharges: 370,
  tollRefundResolution: null,
  driverId: 'd1',
};

const LINKED_TOLL: any = {
  id: '1f2265dd-2db8-4abc-91b0-9dfa47c7abd0',
  date: '2026-03-14',
  tripId: 'ea510908-b6e7-4a49-9e18-14641d0d4fe5',
  isReconciled: true,
  workflowStage: 'personal_use_resolved',
};

describe('Mar 9–15 ghost trip period counts', () => {
  it('linked trip excluded from unlinked actionable when toll tripId is hydrated', () => {
    const linkedTripIds = new Set([String(LINKED_TOLL.tripId)]);
    const isUnresolved = (trip: typeof GHOST_TRIP) => {
      if (!(trip.tollCharges && trip.tollCharges > 0)) return false;
      if (linkedTripIds.has(String(trip.id))) return false;
      const res = trip.tollRefundResolution;
      if (res && res.status && res.status !== 'pending') return false;
      return true;
    };

    const unclaimed = isUnresolved(GHOST_TRIP) ? [GHOST_TRIP] : [];
    expect(unclaimed).toHaveLength(0);

    const counts = computePeriodCounts({
      classified: emptyClassified,
      underpaidClaims: [],
      disputeRefunds: [],
      unclaimedRefundTrips: unclaimed,
    });
    expect(counts['unlinked-refunds'].actionable).toBe(0);
    expect(classifyTollReconPeriodStatus(counts, 0)).toBe('reconciled');
  });

  it('missing toll tripId leaves ghost trip actionable on landing unlinked', () => {
    const counts = zeroCounts();
    incrementUnlinkedRefundCount(counts, GHOST_TRIP);
    expect(counts['unlinked-refunds'].actionable).toBe(1);
    expect(classifyTollReconPeriodStatus(counts, 1)).toBe('in_progress');
  });

  it('linked toll does not increment landing matching buckets', () => {
    const counts = zeroCounts();
    incrementLandingUnclaimedTollCount(counts, LINKED_TOLL, 'needs-review');
    expect(counts['needs-review'].actionable).toBe(0);
  });
});

describe('computePeriodCounts parity with computeStepCounts', () => {
  it('informational dispute refunds do not block finish', () => {
    const counts = computePeriodCounts({
      classified: emptyClassified,
      underpaidClaims: [],
      disputeRefunds: [
        { id: 'dr1', status: 'matched', amount: 10, matchedTollId: 't1', date: '2026-03-10' },
        { id: 'dr2', status: 'auto_resolved', amount: 5, matchedTollId: 't2', date: '2026-03-11' },
      ] as any[],
      unclaimedRefundTrips: [],
    });
    expect(counts['dispute-refunds'].actionable).toBe(0);
    expect(counts['dispute-refunds'].informational).toBe(2);
  });
});
