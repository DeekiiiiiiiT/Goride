/**
 * Driver Settlements Pay residual.
 * `settlementAmount` from company_owes periods is already leftover after settlement_paid.
 */

export function payOutstandingAmount(r: {
  settlementAmount?: number | null;
}): number {
  return Math.max(0, Number(r.settlementAmount) || 0);
}
