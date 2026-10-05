/** Customer wallet rules. Live charging stays off until legal sign-off. */

export type WalletDecision = {
  codAllowed: boolean;
  orderingAllowed: boolean;
  reason: string;
};

export function walletDecision(input: {
  balanceMajor: number;
  debtAgeDays: number;
  completedCardOrders: number;
  walletLive: boolean;
  blockAllOverJmd?: number;
  blockAllAfterDays?: number;
}): WalletDecision {
  // Debit-positive ledger: a positive balance is money the customer owes.
  const owedByCustomer = input.balanceMajor > 0 ? input.balanceMajor : 0;
  const blockAt = input.blockAllOverJmd ?? 5000;
  const blockDays = input.blockAllAfterDays ?? 30;
  if (owedByCustomer > blockAt || (owedByCustomer > 0 && input.debtAgeDays > blockDays)) {
    return { codAllowed: false, orderingAllowed: false, reason: "Balance due is over the limit. Pay it before ordering." };
  }
  if (!input.walletLive && owedByCustomer > 0) {
    return { codAllowed: false, orderingAllowed: true, reason: "Wallet is not live. Cash stays off while a balance is due." };
  }
  if (owedByCustomer > 0) {
    return { codAllowed: false, orderingAllowed: true, reason: "Cash is off until the balance due is paid." };
  }
  if (input.completedCardOrders < 3) {
    return { codAllowed: false, orderingAllowed: true, reason: "Cash unlocks after 3 card orders." };
  }
  return { codAllowed: true, orderingAllowed: true, reason: "Cash is available." };
}

export function applyCreditAtCheckout(total: number, credit: number, useCredit: boolean): { cardDue: number; creditUsed: number } {
  if (!useCredit || credit <= 0) return { cardDue: total, creditUsed: 0 };
  const creditUsed = Math.min(total, credit);
  return {
    creditUsed: Math.round(creditUsed * 100) / 100,
    cardDue: Math.round((total - creditUsed) * 100) / 100,
  };
}
