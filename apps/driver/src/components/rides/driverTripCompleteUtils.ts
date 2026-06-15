import type { CashSettlementOutcome, CashSettlementResponse } from '@roam/types/rides';

export type DriverCashSettlementDisplay = {
  currency: string;
  outcome: CashSettlementOutcome;
  fareMinor: number;
  receivedMinor: number;
  changeMinor: number;
  arrearsMinor: number;
  debtOpenedMinor: number;
  digitalDebitMinor: number;
};

export function resolveDriverCashSettlementDisplay(
  result: CashSettlementResponse,
): DriverCashSettlementDisplay {
  const currency = result.ride.currency ?? 'JMD';
  const fareMinor =
    result.owed_minor ||
    Number(result.ride.fare_final_minor ?? result.ride.fare_estimate_minor ?? 0);
  const receivedMinor =
    result.cash_received_minor ?? Number(result.ride.cash_received_minor ?? 0);
  const changeMinor =
    result.change_credit_minor ?? Math.max(0, receivedMinor - fareMinor);
  const arrearsMinor =
    result.arrears_minor ?? Math.max(0, fareMinor - receivedMinor);
  const deltas = result.wallet_deltas;

  return {
    currency,
    outcome: result.outcome,
    fareMinor,
    receivedMinor,
    changeMinor,
    arrearsMinor,
    debtOpenedMinor: deltas?.driver_debt_opened_minor ?? 0,
    digitalDebitMinor: deltas?.driver_digital_debit_minor ?? 0,
  };
}
