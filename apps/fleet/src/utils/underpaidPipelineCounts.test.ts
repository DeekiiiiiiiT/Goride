import { describe, it, expect } from 'vitest';
import { computeUnderpaidPipelineCounts } from './underpaidPipelineCounts';
import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';

describe('computeUnderpaidPipelineCounts', () => {
  const periodWeekKey = '2025-06-30';
  const fleetTz = 'America/New_York';

  it('returns zero actionable when no losses, partials, or rejected claims', () => {
    const counts = computeUnderpaidPipelineCounts({
      reconciledTolls: [],
      periodClaims: [],
      allClaims: [],
      trips: [],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
    });
    expect(counts.actionable).toBe(0);
    expect(counts.informational).toBe(0);
  });

  it('counts awaiting driver and pending reimbursement as informational only', () => {
    const periodClaims = [
      { id: 'c1', status: 'Sent_to_Driver', transactionId: 't1' } as Claim,
      { id: 'c2', status: 'Submitted_to_Uber', transactionId: 't2' } as Claim,
    ];
    const counts = computeUnderpaidPipelineCounts({
      reconciledTolls: [],
      periodClaims,
      allClaims: periodClaims,
      trips: [],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
    });
    expect(counts.actionable).toBe(0);
    expect(counts.informational).toBe(2);
    expect(counts.awaitingDriver).toBe(1);
    expect(counts.pendingReimbursement).toBe(1);
  });

  it('counts rejected claims as actionable dispute-lost work', () => {
    const periodClaims = [
      { id: 'c1', status: 'Rejected', transactionId: 't1' } as Claim,
    ];
    const counts = computeUnderpaidPipelineCounts({
      reconciledTolls: [],
      periodClaims,
      allClaims: periodClaims,
      trips: [],
      disputeRefunds: [],
      periodWeekKey,
      fleetTz,
    });
    expect(counts.actionable).toBe(1);
    expect(counts.disputeLost).toBe(1);
  });

  it('does not count Open claim when a dispute refund already covers the toll', () => {
    const periodClaims = [
      {
        id: 'c-open',
        status: 'Open',
        amount: 10,
        paidAmount: 370,
        transactionId: 'toll-covered',
      } as Claim,
    ];
    const disputeRefunds = [
      {
        id: 'dr-1',
        status: 'matched',
        matchedTollId: 'toll-covered',
        matchedClaimId: null,
        amount: 10,
      } as DisputeRefund,
    ];
    const counts = computeUnderpaidPipelineCounts({
      reconciledTolls: [],
      periodClaims,
      allClaims: periodClaims,
      trips: [],
      disputeRefunds,
      periodWeekKey,
      fleetTz,
    });
    expect(counts.partialShortfalls).toBe(0);
    expect(counts.actionable).toBe(0);
  });
});
