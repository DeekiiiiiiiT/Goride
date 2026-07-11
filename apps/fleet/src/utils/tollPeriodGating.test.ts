import { describe, it, expect } from 'vitest';
import {
  isClaimActionableNow,
  isClaimInformationalOnly,
  computeStepCounts,
  classifyPeriodUnderpaidClaim,
  countUnclaimedUnderpaidAsPeriodActionable,
} from './tollPeriodGating';
import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';
import type { TollBucket } from './tollBucket';
import { resolveWizardBucket } from './tollBucket';

const claim = (status: Claim['status']): Pick<Claim, 'status'> => ({ status });

describe('isClaimActionableNow / isClaimInformationalOnly', () => {
  it('Rejected blocks (actionable), never informational', () => {
    expect(isClaimActionableNow(claim('Rejected'))).toBe(true);
    expect(isClaimInformationalOnly(claim('Rejected'))).toBe(false);
  });

  it('Open blocks (actionable, fail-safe default), never informational', () => {
    expect(isClaimActionableNow(claim('Open'))).toBe(true);
    expect(isClaimInformationalOnly(claim('Open'))).toBe(false);
  });

  it('Sent_to_Driver is informational only — never blocks', () => {
    expect(isClaimActionableNow(claim('Sent_to_Driver'))).toBe(false);
    expect(isClaimInformationalOnly(claim('Sent_to_Driver'))).toBe(true);
  });

  it('Submitted_to_Uber is informational only — never blocks', () => {
    expect(isClaimActionableNow(claim('Submitted_to_Uber'))).toBe(false);
    expect(isClaimInformationalOnly(claim('Submitted_to_Uber'))).toBe(true);
  });

  it('Resolved is neither actionable nor informational — it is done', () => {
    expect(isClaimActionableNow(claim('Resolved'))).toBe(false);
    expect(isClaimInformationalOnly(claim('Resolved'))).toBe(false);
  });

  it('an unknown/unrecognized status fails safe to actionable, never silently hidden', () => {
    expect(isClaimActionableNow(claim('SomethingNew' as Claim['status']))).toBe(true);
    expect(isClaimInformationalOnly(claim('SomethingNew' as Claim['status']))).toBe(false);
  });
});

describe('classifyPeriodUnderpaidClaim (toll_period_controller mirror)', () => {
  it('Open and Rejected are actionable', () => {
    expect(classifyPeriodUnderpaidClaim(claim('Open'))).toBe('actionable');
    expect(classifyPeriodUnderpaidClaim(claim('Rejected'))).toBe('actionable');
  });

  it('waiting statuses are informational', () => {
    expect(classifyPeriodUnderpaidClaim(claim('Sent_to_Driver'))).toBe('informational');
    expect(classifyPeriodUnderpaidClaim(claim('Submitted_to_Uber'))).toBe('informational');
  });

  it('Resolved is done unless a visible partial shortfall remains', () => {
    expect(classifyPeriodUnderpaidClaim(claim('Resolved'))).toBe('done');
    expect(
      classifyPeriodUnderpaidClaim(claim('Resolved'), { isVisiblePartialShortfall: true }),
    ).toBe('actionable');
  });
});

describe('countUnclaimedUnderpaidAsPeriodActionable', () => {
  it('counts claimless underpaid bucket tolls so Completed cannot ghost past them', () => {
    expect(countUnclaimedUnderpaidAsPeriodActionable('underpaid-claims')).toBe(true);
    expect(countUnclaimedUnderpaidAsPeriodActionable('needs-review')).toBe(false);
    expect(countUnclaimedUnderpaidAsPeriodActionable(null)).toBe(false);
  });
});

describe('computeStepCounts', () => {
  const emptyClassified = (): Record<TollBucket, FinancialTransaction[]> => ({
    'needs-review': [],
    underpaid: [],
    deadhead: [],
    'personal-use': [],
  });

  it('reports all-zero counts when every input is empty', () => {
    const counts = computeStepCounts({
      classified: emptyClassified(),
      underpaidClaims: [],
      disputeRefunds: [],
      unclaimedRefundTrips: [],
    });
    for (const step of Object.keys(counts) as (keyof typeof counts)[]) {
      expect(counts[step]).toEqual({ actionable: 0, informational: 0 });
    }
  });

  it('counts needs-review/personal-use/deadhead directly from their classified buckets', () => {
    const classified = emptyClassified();
    classified['needs-review'] = [{} as FinancialTransaction, {} as FinancialTransaction];
    classified['personal-use'] = [{} as FinancialTransaction];
    classified.deadhead = [{} as FinancialTransaction, {} as FinancialTransaction, {} as FinancialTransaction];

    const counts = computeStepCounts({
      classified,
      underpaidClaims: [],
      disputeRefunds: [],
      unclaimedRefundTrips: [],
    });

    expect(counts['needs-review'].actionable).toBe(2);
    expect(counts['personal-use'].actionable).toBe(1);
    expect(counts.deadhead.actionable).toBe(3);
  });

  it('underpaid-claims sums the underpaid toll bucket AND actionable claims, without double-counting an informational claim', () => {
    const classified = emptyClassified();
    classified.underpaid = [{} as FinancialTransaction];

    const counts = computeStepCounts({
      classified,
      underpaidClaims: [claim('Rejected') as Claim, claim('Sent_to_Driver') as Claim, claim('Resolved') as Claim],
      disputeRefunds: [],
      unclaimedRefundTrips: [],
    });

    // 1 underpaid toll + 1 Rejected claim (actionable) = 2; Sent_to_Driver informational, Resolved neither.
    expect(counts['underpaid-claims'].actionable).toBe(2);
    expect(counts['underpaid-claims'].informational).toBe(1);
  });

  it('underpaid-claims uses underpaidPipeline when provided instead of legacy bucket tally', () => {
    const classified = emptyClassified();
    classified.underpaid = [{} as FinancialTransaction, {} as FinancialTransaction];

    const counts = computeStepCounts({
      classified,
      underpaidClaims: [claim('Open') as Claim],
      disputeRefunds: [],
      unclaimedRefundTrips: [],
      underpaidPipeline: { actionable: 0, informational: 2 },
    });

    expect(counts['underpaid-claims']).toEqual({ actionable: 0, informational: 2 });
  });

  it('dispute-refunds scopes to wizard period when periodWeekKey and fleetTz are set', () => {
    const periodTollIds = new Set(['toll-in-period']);
    const disputeRefunds = [
      { status: 'matched', matchedTollId: 'toll-in-period', date: '2025-06-01' } as DisputeRefund,
      { status: 'matched', matchedTollId: 'toll-other-week', date: '2025-07-01' } as DisputeRefund,
      { status: 'unmatched', date: '2025-06-15' } as DisputeRefund,
    ];
    const counts = computeStepCounts({
      classified: emptyClassified(),
      underpaidClaims: [],
      disputeRefunds,
      unclaimedRefundTrips: [],
      periodWeekKey: '2025-06-02',
      fleetTz: 'America/New_York',
      periodTollIds,
    });
    // Only toll-in-period matched counts as informational; unmatched in period week is actionable.
    expect(counts['dispute-refunds'].informational).toBe(1);
    expect(counts['dispute-refunds'].actionable).toBeGreaterThanOrEqual(0);
  });

  it('dispute-refunds splits unmatched (actionable) from matched/auto_resolved (informational)', () => {
    const disputeRefunds = [
      { status: 'unmatched' } as DisputeRefund,
      { status: 'matched' } as DisputeRefund,
      { status: 'auto_resolved' } as DisputeRefund,
    ];
    const counts = computeStepCounts({
      classified: emptyClassified(),
      underpaidClaims: [],
      disputeRefunds,
      unclaimedRefundTrips: [],
    });
    expect(counts['dispute-refunds']).toEqual({ actionable: 1, informational: 2 });
  });

  it('unlinked-refunds counts unclaimed refund trips as actionable, never informational', () => {
    const counts = computeStepCounts({
      classified: emptyClassified(),
      underpaidClaims: [],
      disputeRefunds: [],
      unclaimedRefundTrips: [{} as Trip, {} as Trip],
    });
    expect(counts['unlinked-refunds']).toEqual({ actionable: 2, informational: 0 });
  });

  it('unlinked-refunds: pending-hold alone is informational', () => {
    const pending = {
      id: 't1',
      tollRefundResolution: { status: 'pending' },
    } as Trip;
    const counts = computeStepCounts({
      classified: emptyClassified(),
      underpaidClaims: [],
      disputeRefunds: [],
      unclaimedRefundTrips: [pending],
    });
    expect(counts['unlinked-refunds']).toEqual({ actionable: 0, informational: 1 });
  });

  it('unlinked-refunds: pending + Accept suggestion stays actionable', () => {
    const pending = {
      id: 't1',
      tollRefundResolution: { status: 'pending' },
    } as Trip;
    const counts = computeStepCounts({
      classified: emptyClassified(),
      underpaidClaims: [],
      disputeRefunds: [],
      unclaimedRefundTrips: [pending],
      unlinkedSuggestionStatusByTripId: new Map([['t1', 'cash_wash']]),
    });
    expect(counts['unlinked-refunds']).toEqual({ actionable: 1, informational: 0 });
  });

  it('unlinked-refunds: pending + recommended Apply shortfall stays actionable', () => {
    const pending = {
      id: 't1',
      tollRefundResolution: { status: 'pending' },
    } as Trip;
    const counts = computeStepCounts({
      classified: emptyClassified(),
      underpaidClaims: [],
      disputeRefunds: [],
      unclaimedRefundTrips: [pending],
      unlinkedSuggestionStatusByTripId: new Map([['t1', 'pending']]),
      unlinkedRecommendedShortfallTripIds: new Set(['t1']),
    });
    expect(counts['unlinked-refunds']).toEqual({ actionable: 1, informational: 0 });
  });

  it('zero-match tag tolls bucketed to personal-use do not block needs-review', () => {
    const classified = emptyClassified();
    classified['personal-use'] = [{ paymentMethod: 'Tag' } as FinancialTransaction];
    const counts = computeStepCounts({
      classified,
      underpaidClaims: [],
      disputeRefunds: [],
      unclaimedRefundTrips: [],
    });
    expect(resolveWizardBucket({ paymentMethod: 'Tag' }, undefined)).toBe('personal-use');
    expect(counts['needs-review'].actionable).toBe(0);
    expect(counts['personal-use'].actionable).toBe(1);
  });
});
