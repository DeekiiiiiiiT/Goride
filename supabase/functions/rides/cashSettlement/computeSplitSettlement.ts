import type { CashSettlementComputed } from "./computeOutcome.ts";
import { computeCashSettlementOutcome } from "./computeOutcome.ts";

export interface SplitSettlementInput {
  owedMinor: number;
  cashReceivedMinor: number;
  riderWalletAvailableMinor: number;
  splitEnabled: boolean;
}

export interface SplitSettlementResult {
  storedOutcome: CashSettlementComputed["outcome"];
  owed_minor: number;
  cash_received_minor: number;
  change_credit_minor: number;
  /** Legacy field: rider-facing arrears; for split = rider_arrears_minor */
  arrears_minor: number;
  wallet_paid_minor: number;
  rider_arrears_minor: number;
  driver_digital_credit_minor: number;
  platform_guarantee_minor: number;
}

export function computeSplitSettlement(input: SplitSettlementInput): SplitSettlementResult {
  const owed = Math.max(0, Math.floor(Number(input.owedMinor) || 0));
  const cashReceived = Math.max(0, Math.floor(Number(input.cashReceivedMinor) || 0));
  const riderAvailable = Math.max(0, Math.floor(Number(input.riderWalletAvailableMinor) || 0));

  if (!input.splitEnabled) {
    const legacy = computeCashSettlementOutcome(owed, cashReceived);
    return {
      storedOutcome: legacy.outcome,
      owed_minor: legacy.owed_minor,
      cash_received_minor: legacy.cash_received_minor,
      change_credit_minor: legacy.change_credit_minor,
      arrears_minor: legacy.arrears_minor,
      wallet_paid_minor: 0,
      rider_arrears_minor: legacy.arrears_minor,
      driver_digital_credit_minor: 0,
      platform_guarantee_minor: 0,
    };
  }

  const legacy = computeCashSettlementOutcome(owed, cashReceived);

  if (legacy.outcome === "unpaid" || legacy.outcome === "exact" || legacy.outcome === "overpay") {
    return {
      storedOutcome: legacy.outcome,
      owed_minor: legacy.owed_minor,
      cash_received_minor: legacy.cash_received_minor,
      change_credit_minor: legacy.change_credit_minor,
      arrears_minor: legacy.arrears_minor,
      wallet_paid_minor: 0,
      rider_arrears_minor: legacy.arrears_minor,
      driver_digital_credit_minor: 0,
      platform_guarantee_minor: 0,
    };
  }

  const shortfall = owed - cashReceived;
  const walletPaid = Math.min(shortfall, riderAvailable);
  const riderArrears = shortfall - walletPaid;
  const platformGuarantee = riderArrears;
  const driverDigitalCredit = shortfall;

  return {
    storedOutcome: "split",
    owed_minor: owed,
    cash_received_minor: cashReceived,
    change_credit_minor: 0,
    arrears_minor: riderArrears,
    wallet_paid_minor: walletPaid,
    rider_arrears_minor: riderArrears,
    driver_digital_credit_minor: driverDigitalCredit,
    platform_guarantee_minor: platformGuarantee,
  };
}

/** Map split result to legacy CashSettlementComputed for API consumers. */
export function splitToLegacyComputed(result: SplitSettlementResult): CashSettlementComputed {
  return {
    outcome: result.storedOutcome,
    owed_minor: result.owed_minor,
    cash_received_minor: result.cash_received_minor,
    change_credit_minor: result.change_credit_minor,
    arrears_minor: result.arrears_minor,
  };
}
