import { describe, expect, it } from 'vitest';
import type { CashSettlementResponse } from '@roam/types/rides';
import { resolveDriverCashSettlementDisplay } from './driverTripCompleteUtils';

function result(partial: Partial<CashSettlementResponse>): CashSettlementResponse {
  return {
    ride: {
      id: 'ride-1',
      currency: 'JMD',
      fare_final_minor: 62320,
      fare_estimate_minor: 62320,
    } as CashSettlementResponse['ride'],
    outcome: 'exact',
    owed_minor: 0,
    cash_received_minor: 0,
    arrears_minor: 0,
    change_credit_minor: 0,
    ...partial,
  };
}

describe('resolveDriverCashSettlementDisplay', () => {
  it('derives fare and received from ride when response fields are zero', () => {
    const display = resolveDriverCashSettlementDisplay(
      result({ outcome: 'overpay', owed_minor: 0, cash_received_minor: 0 }),
    );
    expect(display.fareMinor).toBe(62320);
    expect(display.receivedMinor).toBe(0);
    expect(display.changeMinor).toBe(0);
  });

  it('computes overpay change from response amounts', () => {
    const display = resolveDriverCashSettlementDisplay(
      result({
        outcome: 'overpay',
        owed_minor: 62320,
        cash_received_minor: 100000,
        change_credit_minor: 37680,
        wallet_deltas: {
          rider_credit_minor: 37680,
          driver_cash_credit_minor: 37680,
          driver_digital_debit_minor: 0,
          driver_debt_opened_minor: 37680,
          fare_allocated_minor: 62320,
        },
      }),
    );
    expect(display.changeMinor).toBe(37680);
    expect(display.debtOpenedMinor).toBe(37680);
  });

  it('split trip shows paid with cash and digital breakdown', () => {
    const display = resolveDriverCashSettlementDisplay(
      result({
        outcome: 'split',
        owed_minor: 189915,
        cash_received_minor: 120000,
        wallet_paid_minor: 69915,
        driver_digital_credit_minor: 69915,
        rider_arrears_minor: 0,
        arrears_minor: 0,
      }),
    );
    expect(display.driverFacingOutcome).toBe('paid');
    expect(display.walletPaidMinor).toBe(69915);
    expect(display.driverDigitalCreditMinor).toBe(69915);
    expect(display.riderArrearsMinor).toBe(0);
  });

  it('legacy underpay with wallet journal maps to paid driver outcome', () => {
    const display = resolveDriverCashSettlementDisplay(
      result({
        outcome: 'underpay',
        owed_minor: 189915,
        cash_received_minor: 120000,
        wallet_paid_minor: 69915,
        driver_digital_credit_minor: 69915,
        arrears_minor: 69915,
      }),
    );
    expect(display.driverFacingOutcome).toBe('paid');
    expect(display.driverDigitalCreditMinor).toBe(69915);
  });
});
