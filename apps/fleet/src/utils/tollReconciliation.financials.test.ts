import { describe, it, expect } from 'vitest';
import {
  calculateTollFinancials,
  buildTollFinancialsContext,
  buildTripRefundAllocation,
  VARIANCE_THRESHOLD,
} from './tollReconciliation';
import type { Claim, DisputeRefund, FinancialTransaction, Trip } from '../types/data';

const toll285: FinancialTransaction = {
  id: 'toll-1',
  date: '2026-06-30',
  type: 'Expense',
  category: 'Toll Usage',
  description: 'TransJam Highways',
  amount: -285,
  paymentMethod: 'Tag Balance',
  status: 'Completed',
  isReconciled: true,
  tripId: 'uber-trip-1',
};

const uberTrip: Trip = {
  id: 'uber-trip-1',
  platform: 'Uber',
  date: '2026-06-30',
  tollCharges: 0,
  driverId: 'd1',
};

const unlinkedTrip: Trip = {
  id: 'unlinked-1',
  platform: 'Uber',
  date: '2026-06-29',
  tollCharges: 275,
  driverId: 'd1',
};

describe('calculateTollFinancials enriched', () => {
  it('285 toll / 0 trip refund / paidAmount 275 → net loss 10', () => {
    const claim: Claim = {
      id: 'c1',
      type: 'Toll_Refund',
      status: 'Open',
      driverId: 'd1',
      transactionId: 'toll-1',
      amount: 10,
      expectedAmount: 285,
      paidAmount: 275,
      subject: 'test',
      message: '',
      createdAt: '',
      updatedAt: '',
      unlinkedTripId: 'unlinked-1',
    };
    const ctx = {
      allocatedTripRefund: 0,
      disputeRefundAmount: 0,
      unlinkedSourceTrip: unlinkedTrip,
    };
    const f = calculateTollFinancials(toll285, uberTrip, claim, ctx);
    expect(f.creditsApplied).toBe(275);
    expect(f.netLoss).toBe(10);
    expect(f.status).toBe('Partial Loss');
  });

  it('adds dispute refund without double-counting trip pool', () => {
    const ctx = { allocatedTripRefund: 100, disputeRefundAmount: 50 };
    const f = calculateTollFinancials(toll285, uberTrip, undefined, ctx);
    expect(f.platformRefund).toBe(100);
    expect(f.disputeRefund).toBe(50);
    expect(f.totalRecovered).toBe(150);
    expect(f.netLoss).toBe(135);
  });

  it('caps total recovered at toll cost when trip + paidAmount overlap', () => {
    const claim: Claim = {
      id: 'c2',
      type: 'Toll_Refund',
      status: 'Open',
      driverId: 'd1',
      amount: 10,
      expectedAmount: 285,
      paidAmount: 275,
      subject: 'test',
      message: '',
      createdAt: '',
      updatedAt: '',
    };
    const ctx = { allocatedTripRefund: 275, disputeRefundAmount: 0 };
    const f = calculateTollFinancials(toll285, { ...uberTrip, tollCharges: 275 }, claim, ctx);
    expect(f.totalRecovered).toBe(285);
    expect(f.netLoss).toBe(0);
  });

  it('does not count Charge Driver amount as recovered without a posted debit', () => {
    const claim: Claim = {
      id: 'c3',
      type: 'Toll_Refund',
      status: 'Resolved',
      resolutionReason: 'Charge Driver',
      driverId: 'd1',
      amount: 10,
      expectedAmount: 285,
      paidAmount: 275,
      subject: 'test',
      message: '',
      createdAt: '',
      updatedAt: '',
    };
    const f = calculateTollFinancials(toll285, { ...uberTrip, tollCharges: 275 }, claim);
    expect(f.driverRecovered).toBe(0);
    expect(f.totalRecovered).toBe(285);
  });

  it('legacy path without ctx still uses trip.tollCharges', () => {
    const f = calculateTollFinancials(toll285, { ...uberTrip, tollCharges: 275 });
    expect(f.platformRefund).toBe(275);
    expect(f.netLoss).toBe(10);
  });

  it('buildTollFinancialsContext resolves dispute and unlinked trip', () => {
    const tx: FinancialTransaction = {
      ...toll285,
      unlinkedSourceTripId: 'unlinked-1',
    };
    const disputes: DisputeRefund[] = [
      {
        id: 'dr1',
        supportCaseId: 'x',
        amount: 20,
        date: '',
        driverId: 'd1',
        driverName: 'Test',
        platform: 'Uber',
        source: 'platform_import',
        status: 'matched',
        matchedTollId: 'toll-1',
        matchedClaimId: null,
        importedAt: '',
        resolvedAt: null,
        resolvedBy: null,
        rawDescription: '',
      },
    ];
    const ctx = buildTollFinancialsContext(tx, uberTrip, undefined, [unlinkedTrip], disputes);
    expect(ctx.disputeRefundAmount).toBe(20);
    expect(ctx.unlinkedSourceTrip?.id).toBe('unlinked-1');
  });

  it('buildTripRefundAllocation pools sibling tolls on same trip', () => {
    const tripWithRefund: Trip = { id: 'trip-a', platform: 'Uber', date: '2026-06-30', tollCharges: 100 };
    const tolls = [
      { id: 'a', tripId: 'trip-a', date: '2026-06-30', amount: -60 },
      { id: 'b', tripId: 'trip-a', date: '2026-06-30', amount: -50 },
    ];
    const alloc = buildTripRefundAllocation(tolls, new Map([['trip-a', tripWithRefund]]));
    expect(alloc.get('a')).toBe(60);
    expect(alloc.get('b')).toBe(40);
  });

  it('treats near-zero net loss as recovered within tolerance', () => {
    const f = calculateTollFinancials(toll285, { ...uberTrip, tollCharges: 285 - VARIANCE_THRESHOLD });
    expect(f.status).toBe('Recovered');
    expect(f.netLoss).toBe(0);
  });
});
