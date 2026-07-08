import { describe, it, expect } from 'vitest';
import {
  coversShortfallFully,
  leftoverAfterApply,
  remainingClaimShortfall,
  scoreUnlinkedShortfallMatch,
  isPendingOnlyRefundResolution,
  hasBlockingUnlinkedRefund,
} from './unlinkedShortfallEligibility';

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

  it('scores $275 refund near $285 toll highly', () => {
    const score = scoreUnlinkedShortfallMatch({
      tripRefund: 275,
      tripDate: '2026-06-29',
      remainingShortfall: 285,
      tollAmount: 285,
      claimOrTollDate: '2026-06-29',
    });
    expect(score).toBeGreaterThanOrEqual(50);
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
});
