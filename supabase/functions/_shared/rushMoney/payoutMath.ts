/** Payout figures come from ledger balances, never from a typed amount. */

export type PayoutInput = {
  payableMinor: number;
  receivableMinor: number;
  reserveMinor: number;
  cashAlreadyKeptMinor: number;
};

export function merchantPayoutMinor(input: PayoutInput): number {
  return Math.max(0, input.payableMinor - input.receivableMinor - input.reserveMinor);
}

export function courierPayoutMinor(input: PayoutInput): number {
  // Cash already kept is not part of payable. Payable is digital earnings only.
  return Math.max(0, input.payableMinor - input.receivableMinor);
}

export function twoPersonApproval(actorIds: string[]): boolean {
  return new Set(actorIds.filter(Boolean)).size >= 2;
}
