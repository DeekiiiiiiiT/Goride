/**
 * Net personal-use toll amount billed to the driver from wallet projections.
 * Charges are negative `Toll Charge` / `driver_toll_charge` rows; reversals are
 * positive `driver_toll_charge_reversal` (same category). Summing Math.abs of
 * every Toll Charge row inflated Expenses / Cash Wallet (charge + reversal both
 * counted as debt).
 */

export interface TollChargeLike {
  amount?: number | null;
  category?: string | null;
  metadata?: { projection?: string | null } | null;
}

export function isDriverTollChargeRow(tx: TollChargeLike): boolean {
  const projection = tx.metadata?.projection;
  if (projection === 'driver_toll_charge' || projection === 'driver_toll_charge_reversal') {
    return true;
  }
  return tx.category === 'Toll Charge';
}

/** Amount the driver owes from these rows (reversals net out charges). Never negative. */
export function netDriverTollCharges(transactions: TollChargeLike[]): number {
  let signed = 0;
  for (const tx of transactions) {
    if (!tx || !isDriverTollChargeRow(tx)) continue;
    signed += Number(tx.amount) || 0;
  }
  // Charges are stored negative → -signed is the debt; reversals reduce it.
  return Math.max(0, -signed);
}
