import { describe, it, expect } from 'vitest';
import {
  countListablePendingUnderpaid,
  evaluateListableUnderpaidShortfall,
  listFullyCoveredPendingUnderpaid,
  resolvePendingUnderpaidTripId,
} from './pendingUnderpaidListable';
import { computeUnderpaidPipelineCounts } from './underpaidPipelineCounts';
import type { Claim, FinancialTransaction, Trip } from '../types/data';
import { STEP_ORDER } from './tollPeriodGating';

const periodWeekKey = '2026-06-29';
const fleetTz = 'America/Jamaica';

function trip(partial: Partial<Trip> & { id: string }): Trip {
  return {
    date: '2026-06-30',
    platform: 'Uber',
    status: 'Completed',
    tollCharges: 100,
    driverId: 'd1',
    ...partial,
  } as Trip;
}

function toll(partial: Partial<FinancialTransaction> & { id: string }): FinancialTransaction {
  return {
    amount: -380,
    date: '2026-06-30',
    time: '12:00:00',
    isReconciled: false,
    description: 'Toll',
    ...partial,
  } as FinancialTransaction;
}

describe('resolvePendingUnderpaidTripId', () => {
  it('prefers live suggestion trip over matchedTripId', () => {
    const tx = toll({ id: 't1', matchedTripId: 'old' });
    const suggestions = new Map([['t1', [{ trip: { id: 'live' } }]]]);
    expect(resolvePendingUnderpaidTripId(tx, suggestions)).toBe('live');
  });

  it('falls back to matchedTripId', () => {
    expect(resolvePendingUnderpaidTripId(toll({ id: 't1', matchedTripId: 'kept' }), null)).toBe(
      'kept',
    );
  });
});

describe('countListablePendingUnderpaid', () => {
  const shortTrip = trip({ id: 'trip-a', tollCharges: 100 });
  const fullTrip = trip({ id: 'trip-b', tollCharges: 380 });

  it('counts pending with trip + material shortfall', () => {
    const pending = [toll({ id: 't1', matchedTripId: 'trip-a', amount: -380 })];
    const n = countListablePendingUnderpaid({
      pendingUnderpaidTolls: pending,
      tripMap: new Map([['trip-a', shortTrip]]),
      claimByTollId: new Map(),
      partialByTollId: new Set(),
      reconciledTollById: new Map(),
      trips: [shortTrip],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
    });
    expect(n).toBe(1);
  });

  it('ignores pending with no trip id', () => {
    const pending = [toll({ id: 't1', matchedTripId: null })];
    const n = countListablePendingUnderpaid({
      pendingUnderpaidTolls: pending,
      tripMap: new Map(),
      claimByTollId: new Map(),
      partialByTollId: new Set(),
      reconciledTollById: new Map(),
      trips: [],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
    });
    expect(n).toBe(0);
  });

  it('does not list fully-covered pending (auto-clear target, not Underpaid Tolls)', () => {
    const pending = [toll({ id: 't1', matchedTripId: 'trip-b', amount: -380 })];
    const n = countListablePendingUnderpaid({
      pendingUnderpaidTolls: pending,
      tripMap: new Map([['trip-b', fullTrip]]),
      claimByTollId: new Map(),
      partialByTollId: new Set(),
      reconciledTollById: new Map(),
      trips: [fullTrip],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
    });
    expect(n).toBe(0);
  });

  it('pools trip refunds — only real shortfall siblings stay listable', () => {
    // FIFO: first toll fully covered ($380 of $645), second keeps $20 shortfall.
    const shared = trip({ id: 'trip-shared', tollCharges: 645 });
    const pending = [
      toll({ id: 'a', matchedTripId: 'trip-shared', amount: -380, time: '10:00:00' }),
      toll({ id: 'b', matchedTripId: 'trip-shared', amount: -285, time: '11:00:00' }),
    ];
    const n = countListablePendingUnderpaid({
      pendingUnderpaidTolls: pending,
      tripMap: new Map([['trip-shared', shared]]),
      claimByTollId: new Map(),
      partialByTollId: new Set(),
      reconciledTollById: new Map(),
      trips: [shared],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
    });
    expect(n).toBe(1);
  });
});

describe('listFullyCoveredPendingUnderpaid', () => {
  it('returns fully covered pending for auto-clear', () => {
    const fullTrip = trip({ id: 'trip-b', tollCharges: 380 });
    const covered = listFullyCoveredPendingUnderpaid({
      pendingUnderpaidTolls: [toll({ id: 't1', matchedTripId: 'trip-b', amount: -380 })],
      tripMap: new Map([['trip-b', fullTrip]]),
      claimByTollId: new Map(),
      partialByTollId: new Set(),
      reconciledTollById: new Map(),
      trips: [fullTrip],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
    });
    expect(covered).toHaveLength(1);
    expect(covered[0].transaction.id).toBe('t1');
    expect(covered[0].trip.id).toBe('trip-b');
    expect(covered[0].financials.netLoss).toBeLessThanOrEqual(0.05);
  });

  it('skips Open-claim tolls (Partially Covered owns them)', () => {
    const fullTrip = trip({ id: 'trip-b', tollCharges: 380 });
    const claim = { id: 'c1', status: 'Open', transactionId: 't1', amount: 10 } as Claim;
    const covered = listFullyCoveredPendingUnderpaid({
      pendingUnderpaidTolls: [toll({ id: 't1', matchedTripId: 'trip-b', amount: -380 })],
      tripMap: new Map([['trip-b', fullTrip]]),
      claimByTollId: new Map([['t1', claim]]),
      partialByTollId: new Set(),
      reconciledTollById: new Map(),
      trips: [fullTrip],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
    });
    expect(covered).toHaveLength(0);
  });
});

describe('computeUnderpaidPipelineCounts + pending', () => {
  it('does not block Finish for fully-covered pending (cleared / not listable)', () => {
    const fullTrip = trip({ id: 'trip-b', tollCharges: 380 });
    const counts = computeUnderpaidPipelineCounts({
      reconciledTolls: [],
      periodClaims: [],
      allClaims: [],
      trips: [fullTrip],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
      pendingUnderpaidTolls: [
        toll({ id: 'ghost-1', matchedTripId: 'trip-b', amount: -380 }),
        toll({ id: 'ghost-2', matchedTripId: null, amount: -200 }),
        toll({ id: 'ghost-3', matchedTripId: 'missing', amount: -150 }),
      ],
    });
    expect(counts.underpaidTolls).toBe(0);
    expect(counts.actionable).toBe(0);
  });

  it('counts Open claims as actionable even without a reconciled trip link', () => {
    const counts = computeUnderpaidPipelineCounts({
      reconciledTolls: [],
      periodClaims: [
        {
          id: 'c-open',
          status: 'Open',
          amount: 10,
          paidAmount: 370,
          transactionId: 'toll-orphan',
        } as Claim,
      ],
      allClaims: [],
      trips: [],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
      pendingUnderpaidTolls: [],
    });
    expect(counts.actionable).toBe(1);
    expect(counts.partialShortfalls).toBe(1);
  });

  it('counts listable pending shortfall as actionable', () => {
    const shortTrip = trip({ id: 'trip-a', tollCharges: 100 });
    const counts = computeUnderpaidPipelineCounts({
      reconciledTolls: [],
      periodClaims: [],
      allClaims: [],
      trips: [shortTrip],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
      pendingUnderpaidTolls: [toll({ id: 't1', matchedTripId: 'trip-a', amount: -380 })],
    });
    expect(counts.underpaidTolls).toBe(1);
    expect(counts.actionable).toBe(1);
  });
});

describe('wizard Needs Review card total', () => {
  it('sums step actionable counts (Finish gate alignment)', () => {
    const stepCounts = {
      'needs-review': { actionable: 0, informational: 0 },
      'personal-use': { actionable: 0, informational: 0 },
      deadhead: { actionable: 0, informational: 0 },
      'dispute-refunds': { actionable: 0, informational: 0 },
      'unlinked-refunds': { actionable: 0, informational: 0 },
      'underpaid-claims': { actionable: 0, informational: 0 },
    };
    const total = STEP_ORDER.reduce((sum, id) => sum + (stepCounts[id]?.actionable || 0), 0);
    expect(total).toBe(0);

    stepCounts['underpaid-claims'].actionable = 3;
    const blocked = STEP_ORDER.reduce((sum, id) => sum + (stepCounts[id]?.actionable || 0), 0);
    expect(blocked).toBe(3);
  });
});

describe('evaluateListableUnderpaidShortfall', () => {
  it('rejects when claim is already Sent_to_Driver', () => {
    const t = trip({ id: 'trip-a', tollCharges: 50 });
    const tx = toll({ id: 't1', tripId: 'trip-a', amount: -200 });
    const claim = { id: 'c1', status: 'Sent_to_Driver', transactionId: 't1' } as Claim;
    const result = evaluateListableUnderpaidShortfall(tx, t, {
      claimByTollId: new Map([['t1', claim]]),
      partialByTollId: new Set(),
      reconciledTollById: new Map([['t1', tx]]),
      trips: [t],
      disputeRefunds: [],
      allocation: new Map(),
      periodWeekKey,
      fleetTz,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects when netLoss is within tolerance', () => {
    const t = trip({ id: 'trip-a', tollCharges: 200 });
    const tx = toll({ id: 't1', tripId: 'trip-a', amount: -200 });
    const result = evaluateListableUnderpaidShortfall(tx, t, {
      claimByTollId: new Map(),
      partialByTollId: new Set(),
      reconciledTollById: new Map([['t1', tx]]),
      trips: [t],
      disputeRefunds: [],
      allocation: new Map([['t1', 200]]),
      periodWeekKey,
      fleetTz,
    });
    expect(result.ok).toBe(false);
  });
});
