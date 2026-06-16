export type CashSettlementOutcome = "exact" | "underpay" | "overpay" | "unpaid" | "split";

export interface CashSettlementComputed {
  outcome: CashSettlementOutcome;
  owed_minor: number;
  cash_received_minor: number;
  arrears_minor: number;
  change_credit_minor: number;
}

export function computeCashSettlementOutcome(
  owedMinor: number,
  receivedMinor: number,
): CashSettlementComputed {
  const owed = Math.max(0, Math.floor(Number(owedMinor) || 0));
  const received = Math.max(0, Math.floor(Number(receivedMinor) || 0));
  const delta = received - owed;

  if (received === 0 && owed > 0) {
    return {
      outcome: "unpaid",
      owed_minor: owed,
      cash_received_minor: received,
      arrears_minor: owed,
      change_credit_minor: 0,
    };
  }

  if (delta === 0) {
    return {
      outcome: "exact",
      owed_minor: owed,
      cash_received_minor: received,
      arrears_minor: 0,
      change_credit_minor: 0,
    };
  }

  if (delta < 0) {
    return {
      outcome: "underpay",
      owed_minor: owed,
      cash_received_minor: received,
      arrears_minor: -delta,
      change_credit_minor: 0,
    };
  }

  return {
    outcome: "overpay",
    owed_minor: owed,
    cash_received_minor: received,
    arrears_minor: 0,
    change_credit_minor: delta,
  };
}
