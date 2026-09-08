/**
 * Driver Settlements Pay residual.
 * `settlementAmount` from company_owes periods is already leftover after settlement_paid.
 */

export function payOutstandingAmount(r: {
  settlementAmount?: number | null;
}): number {
  return Math.max(0, Number(r.settlementAmount) || 0);
}

/**
 * Desk pay residual for list/modal/expectedOutstanding.
 * Always uses settlementAmount — never amountOwed (queue historically double-subtracted paid).
 */
export function resolvePayQueueOwed(r: {
  settlementAmount?: number | null;
  amountOwed?: number | null;
  amountOwedMinor?: number | null;
  settlementPaid?: number | null;
}): number {
  void r.amountOwed;
  void r.amountOwedMinor;
  void r.settlementPaid;
  return payOutstandingAmount(r);
}
