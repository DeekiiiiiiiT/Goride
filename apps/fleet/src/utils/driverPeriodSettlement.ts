/**
 * The ONE shared per-period settlement calculation — the single source of truth
 * that every driver financial tab (Expenses / Settlement / Payout / Cash Wallet)
 * renders when the unified toll-settlement flag is ON.
 *
 * Locked model (see plan): each toll affects the driver in exactly ONE place.
 *   - Payout   = driverShare − fuelDeduction        (tolls are NOT deducted here)
 *   - Cash side carries all toll effects:
 *       cashOwed  = baseCashOwed + Charged to Driver (Toll Charge rows / Recon claims)
 *       cashPaid  = baseCashPaid + cash-wash tolls      (driver credited)
 *   - Settlement = netPayout − cashBalance
 *
 * Charged to Driver must match Expenses + Toll Reconciliation "Charge Driver"
 * totals (wallet Toll Charge rows) — never disposition.personal plaza sums.
 */

export interface PeriodSettlementInput {
  driverShare: number;
  fuelDeduction: number;
  /** Toll-neutral physical cash for the period (no toll credit/debit applied). */
  baseCashOwed: number;
  baseCashPaid: number;
  /** Server disposition: cash tolls the driver paid (credit). */
  tollCashWash: number;
  /** Amount billed to driver — Toll Charge rows / Recon Charge Driver (not plaza personal sum). */
  tollPersonal: number;
  /**
   * Fuel settlement credits (cash already reimbursed to the driver for
   * out-of-pocket fuel purchases) that reduce their cash-owed balance.
   * Optional — omit for call sites that don't track this separately; defaults
   * to 0, so existing callers are unaffected.
   */
  fuelCredits?: number;
}

export interface PeriodSettlementResult {
  netPayout: number;
  tollChargedToDriver: number;
  tollCashWash: number;
  cashOwed: number;
  cashPaid: number;
  /** Gross cash balance (cashOwed − cashPaid), before fuel-credit netting. */
  cashBalance: number;
  /** cashBalance minus fuelCredits — what settlement is actually computed against. */
  adjCashBalance: number;
  /** netPayout − adjCashBalance. Positive = company owes the driver; negative = driver owes the company. */
  settlement: number;
  // Still Held = adjCashBalance. Bank confirm / CSV match must never alter these inputs.
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computePeriodSettlement(i: PeriodSettlementInput): PeriodSettlementResult {
  const netPayout = round((i.driverShare || 0) - (i.fuelDeduction || 0));
  const tollPersonal = round(Math.max(0, i.tollPersonal || 0));
  const tollCashWash = round(Math.max(0, i.tollCashWash || 0));
  const fuelCredits = round(Math.max(0, i.fuelCredits || 0));

  const cashOwed = round((i.baseCashOwed || 0) + tollPersonal);
  const cashPaid = round((i.baseCashPaid || 0) + tollCashWash);
  const cashBalance = round(cashOwed - cashPaid);
  const adjCashBalance = round(cashBalance - fuelCredits);
  const settlement = round(netPayout - adjCashBalance);

  return {
    netPayout,
    tollChargedToDriver: tollPersonal,
    tollCashWash,
    cashOwed,
    cashPaid,
    cashBalance,
    adjCashBalance,
    settlement,
  };
}
