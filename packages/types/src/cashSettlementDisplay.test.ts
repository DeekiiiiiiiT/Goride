import { describe, expect, it } from 'vitest';
import {
  computeCashSettlementOutcome,
  computeOutcomeFromRide,
  getCashPaymentCardMode,
  isCashRide,
  resolveLockedFareMinor,
  showSettlementResultOnTripScreen,
} from './cashSettlementDisplay';
import type { CashSettlementRidePick } from './cashSettlementDisplay';

function ride(partial: Partial<CashSettlementRidePick>): CashSettlementRidePick {
  return {
    payment_method: 'cash',
    status: 'on_trip',
    fare_final_minor: null,
    fare_estimate_minor: 65358,
    cash_received_minor: null,
    cash_settlement_outcome: null,
    currency: 'JMD',
    ...partial,
  };
}

describe('isCashRide', () => {
  it('returns true for cash', () => {
    expect(isCashRide({ payment_method: 'cash' })).toBe(true);
  });
  it('returns false for card', () => {
    expect(isCashRide({ payment_method: 'card' })).toBe(false);
  });
});

describe('resolveLockedFareMinor', () => {
  it('prefers fare_final_minor', () => {
    expect(resolveLockedFareMinor(ride({ fare_final_minor: 1000 }))).toBe(1000);
  });
  it('returns null on on_trip without lock', () => {
    expect(resolveLockedFareMinor(ride({ status: 'on_trip', fare_final_minor: null }))).toBeNull();
  });
  it('falls back to estimate when awaiting settlement', () => {
    expect(
      resolveLockedFareMinor(
        ride({ status: 'awaiting_cash_settlement', fare_final_minor: null, fare_estimate_minor: 500 }),
      ),
    ).toBe(500);
  });
});

describe('computeCashSettlementOutcome', () => {
  it('exact', () => {
    const r = computeCashSettlementOutcome(1000, 1000);
    expect(r.outcome).toBe('exact');
    expect(r.arrears_minor).toBe(0);
    expect(r.change_credit_minor).toBe(0);
  });
  it('underpay', () => {
    const r = computeCashSettlementOutcome(1000, 600);
    expect(r.outcome).toBe('underpay');
    expect(r.arrears_minor).toBe(400);
  });
  it('overpay', () => {
    const r = computeCashSettlementOutcome(1000, 1500);
    expect(r.outcome).toBe('overpay');
    expect(r.change_credit_minor).toBe(500);
  });
  it('unpaid', () => {
    const r = computeCashSettlementOutcome(1000, 0);
    expect(r.outcome).toBe('unpaid');
    expect(r.arrears_minor).toBe(1000);
  });
});

describe('getCashPaymentCardMode', () => {
  it('hidden for card', () => {
    expect(getCashPaymentCardMode(ride({ payment_method: 'card' }))).toBe('hidden');
  });
  it('hidden on on_trip', () => {
    expect(getCashPaymentCardMode(ride({ status: 'on_trip' }))).toBe('hidden');
  });
  it('awaiting_payment at settlement', () => {
    expect(
      getCashPaymentCardMode(
        ride({ status: 'awaiting_cash_settlement', fare_final_minor: 65358 }),
      ),
    ).toBe('awaiting_payment');
  });
  it('summary_arrears for underpay', () => {
    expect(
      getCashPaymentCardMode(
        ride({
          status: 'completed',
          fare_final_minor: 1000,
          cash_received_minor: 600,
          cash_settlement_outcome: 'underpay',
        }),
      ),
    ).toBe('summary_arrears');
  });
  it('summary_paid for exact', () => {
    expect(
      getCashPaymentCardMode(
        ride({
          status: 'completed',
          fare_final_minor: 1000,
          cash_received_minor: 1000,
          cash_settlement_outcome: 'exact',
        }),
      ),
    ).toBe('summary_paid');
  });
});

describe('computeOutcomeFromRide', () => {
  it('null while awaiting settlement', () => {
    expect(
      computeOutcomeFromRide(ride({ status: 'awaiting_cash_settlement', fare_final_minor: 1000 })),
    ).toBeNull();
  });
  it('derives from completed ride', () => {
    const r = computeOutcomeFromRide(
      ride({
        status: 'completed',
        fare_final_minor: 1000,
        cash_received_minor: 1500,
        cash_settlement_outcome: 'overpay',
      }),
    );
    expect(r?.change_credit_minor).toBe(500);
  });
});

describe('showSettlementResultOnTripScreen', () => {
  it('exact and overpay only', () => {
    expect(showSettlementResultOnTripScreen('exact')).toBe(true);
    expect(showSettlementResultOnTripScreen('overpay')).toBe(true);
    expect(showSettlementResultOnTripScreen('underpay')).toBe(false);
    expect(showSettlementResultOnTripScreen('unpaid')).toBe(false);
  });
});
