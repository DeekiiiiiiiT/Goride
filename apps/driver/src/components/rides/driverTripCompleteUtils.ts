import type { CashSettlementOutcome, CashSettlementResponse, DriverFacingSettlementOutcome } from '@roam/types/rides';
import { resolveDriverFacingOutcome } from '@roam/types/cashSettlementDisplay';

export type DriverCashSettlementDisplay = {
  currency: string;
  outcome: CashSettlementOutcome;
  driverFacingOutcome: DriverFacingSettlementOutcome;
  fareMinor: number;
  receivedMinor: number;
  changeMinor: number;
  arrearsMinor: number;
  walletPaidMinor: number;
  driverDigitalCreditMinor: number;
  riderArrearsMinor: number;
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
  const walletPaidMinor = result.wallet_paid_minor ?? 0;
  const driverDigitalCreditMinor =
    result.driver_digital_credit_minor ?? walletPaidMinor;
  const riderArrearsMinor = result.rider_arrears_minor ?? arrearsMinor;
  const deltas = result.wallet_deltas;
  const driverFacingOutcome = resolveDriverFacingOutcome(
    result.outcome,
    walletPaidMinor || driverDigitalCreditMinor,
  );

  return {
    currency,
    outcome: result.outcome,
    driverFacingOutcome,
    fareMinor,
    receivedMinor,
    changeMinor,
    arrearsMinor,
    walletPaidMinor,
    driverDigitalCreditMinor,
    riderArrearsMinor,
    debtOpenedMinor: deltas?.driver_debt_opened_minor ?? 0,
    digitalDebitMinor: deltas?.driver_digital_debit_minor ?? 0,
  };
}
