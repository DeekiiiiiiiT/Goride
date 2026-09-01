/** Re-derive directional settlement_status from settlement_amount (P-1 backfill logic). */
export function deriveDirectionalSettlementStatus(settlementAmount: number): string {
  const amt = Number(settlementAmount) || 0;
  if (Math.abs(amt) < 0.01) return 'settled';
  if (amt > 0) return 'company_owes';
  return 'driver_owes';
}
