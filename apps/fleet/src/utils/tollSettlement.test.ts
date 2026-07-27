import { describe, it, expect } from 'vitest';
import {
  activeSettlementCredits,
  remainingTollShortfall,
  clampSettlementApply,
  validateMultiTargetShares,
  projectClaimFromSettlement,
  settlementIdempotencyKey,
  computeDisputeMatchDetailFinancials,
  type SettlementAllocationLike,
} from './tollSettlement';

describe('tollSettlement', () => {
  const tollId = 'toll-a';

  it('$380 − $370 unlinked − $10 dispute = $0', () => {
    const allocs: SettlementAllocationLike[] = [
      { id: '1', sourceType: 'unlinked_trip', sourceId: 'trip-1', tollId, amount: 370 },
      { id: '2', sourceType: 'dispute_refund', sourceId: 'dr-1', tollId, amount: 10 },
    ];
    expect(activeSettlementCredits(allocs, tollId)).toBe(380);
    expect(remainingTollShortfall(380, allocs, tollId)).toBe(0);
    const projected = projectClaimFromSettlement({ tollCost: 380, remaining: 0, priorPaid: 380 });
    expect(projected.status).toBe('Resolved');
    expect(projected.resolutionReason).toBe('Reimbursed');
    expect(projected.amount).toBe(0);
  });

  it('partial dispute leaves open shortfall', () => {
    const allocs: SettlementAllocationLike[] = [
      { id: '1', sourceType: 'unlinked_trip', sourceId: 'trip-1', tollId, amount: 370 },
      { id: '2', sourceType: 'dispute_refund', sourceId: 'dr-1', tollId, amount: 5 },
    ];
    expect(remainingTollShortfall(380, allocs, tollId)).toBe(5);
    const projected = projectClaimFromSettlement({ tollCost: 380, remaining: 5, priorPaid: 375 });
    expect(projected.status).toBe('Open');
    expect(projected.amount).toBe(5);
  });

  it('reversal removes a credit from the active total', () => {
    const allocs: SettlementAllocationLike[] = [
      { id: '1', sourceType: 'unlinked_trip', sourceId: 'trip-1', tollId, amount: 370 },
      {
        id: 'r1',
        sourceType: 'reversal',
        sourceId: 'trip-1',
        tollId,
        amount: 370,
        reversesId: '1',
      },
      { id: '2', sourceType: 'dispute_refund', sourceId: 'dr-1', tollId, amount: 10 },
    ];
    expect(activeSettlementCredits(allocs, tollId)).toBe(10);
    expect(remainingTollShortfall(380, allocs, tollId)).toBe(370);
  });

  it('clampSettlementApply soft-caps over-allocation', () => {
    const allocs: SettlementAllocationLike[] = [
      { id: '1', sourceType: 'unlinked_trip', sourceId: 'trip-1', tollId, amount: 370 },
    ];
    const r = clampSettlementApply(380, allocs, tollId, 50);
    expect(r.overAllocation).toBe(true);
    expect(r.applyAmount).toBe(10);
    expect(r.remainingAfter).toBe(0);
  });

  it('validateMultiTargetShares rejects duplicates and over-budget', () => {
    expect(
      validateMultiTargetShares(370, [
        { tollId: 'a', share: 285 },
        { tollId: 'a', share: 85 },
      ]).ok,
    ).toBe(false);
    expect(
      validateMultiTargetShares(370, [
        { tollId: 'a', share: 285 },
        { tollId: 'b', share: 100 },
      ]).ok,
    ).toBe(false);
    expect(
      validateMultiTargetShares(370, [
        { tollId: 'a', share: 285 },
        { tollId: 'b', share: 85 },
      ]).ok,
    ).toBe(true);
  });

  it('settlementIdempotencyKey is stable', () => {
    expect(settlementIdempotencyKey('dispute_refund', 'dr-1', 'toll-a', 10)).toBe(
      'dispute_refund:dr-1:toll-a:10.00',
    );
  });

  it('$380 toll + $370 trip_refund + $10 dispute projects Reimbursed', () => {
    const allocs: SettlementAllocationLike[] = [
      { id: '1', sourceType: 'trip_refund', sourceId: 'trip-1', tollId, amount: 370 },
      { id: '2', sourceType: 'dispute_refund', sourceId: 'dr-1', tollId, amount: 10 },
    ];
    expect(remainingTollShortfall(380, allocs, tollId)).toBe(0);
    const projected = projectClaimFromSettlement({
      tollCost: 380,
      remaining: remainingTollShortfall(380, allocs, tollId),
      priorPaid: 380,
    });
    expect(projected.status).toBe('Resolved');
    expect(projected.resolutionReason).toBe('Reimbursed');
    expect(projected.amount).toBe(0);
  });

  it('match-detail financials prefer live trip over inverted claim residual', () => {
    // Bad claim.amount=370 after broken reproject must NOT become "Paid $10".
    const fin = computeDisputeMatchDetailFinancials({
      tollCost: 380,
      liveTripRefund: 370,
      settlementTripSideCredits: 10, // ignored when live is present
      disputeRefund: 10,
    });
    expect(fin.tripRefund).toBe(370);
    expect(fin.shortfall).toBe(10);
    expect(fin.variance).toBe(0);
    expect(fin.coversShortfallFully).toBe(true);
  });

  it('match-detail falls back to settlement trip-side credits', () => {
    const fin = computeDisputeMatchDetailFinancials({
      tollCost: 380,
      liveTripRefund: null,
      settlementTripSideCredits: 370,
      disputeRefund: 10,
    });
    expect(fin.tripRefund).toBe(370);
    expect(fin.shortfall).toBe(10);
    expect(fin.coversShortfallFully).toBe(true);
  });
});
