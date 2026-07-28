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
  /**
   * Cash write-offs tagged to this Settlement Week — company loss that reduces
   * still held without counting as cash returned. Defaults to 0.
   */
  cashWrittenOff?: number;
  /**
   * Cleared Driver Payout txs tagged to this Settlement Week — reduces what the
   * company still owes the driver. Never touches cash returned / still held.
   */
  settlementPaid?: number;
}

export interface PeriodSettlementResult {
  netPayout: number;
  tollChargedToDriver: number;
  tollCashWash: number;
  cashOwed: number;
  cashPaid: number;
  /** Gross cash balance (cashOwed − cashPaid), before fuel-credit / write-off netting. */
  cashBalance: number;
  /** cashBalance minus fuelCredits minus cashWrittenOff — what settlement is actually computed against. */
  adjCashBalance: number;
  /** netPayout − adjCashBalance before payouts. Positive = company owes driver. */
  grossSettlement: number;
  /** Cleared payout amount applied (only when grossSettlement > 0). */
  settlementPaid: number;
  /**
   * Outstanding after payouts: grossSettlement − settlementPaid when company owes;
   * else grossSettlement. Positive = company owes; negative = driver owes.
   */
  settlement: number;
  // Still Held = adjCashBalance. Bank confirm / CSV match must never alter these inputs.
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computePeriodSettlement(i: PeriodSettlementInput): PeriodSettlementResult {
  const netPayout = round((i.driverShare || 0) - (i.fuelDeduction || 0));
  const tollPersonal = round(Math.max(0, i.tollPersonal || 0));
  const tollCashWash = round(Math.max(0, i.tollCashWash || 0));
  const fuelCredits = round(Math.max(0, i.fuelCredits || 0));
  const cashWrittenOff = round(Math.max(0, i.cashWrittenOff || 0));
  const settlementPaidIn = round(Math.max(0, i.settlementPaid || 0));

  const cashOwed = round((i.baseCashOwed || 0) + tollPersonal);
  const cashPaid = round((i.baseCashPaid || 0) + tollCashWash);
  const cashBalance = round(cashOwed - cashPaid);
  const adjCashBalance = round(cashBalance - fuelCredits - cashWrittenOff);
  const grossSettlement = round(netPayout - adjCashBalance);
  // Payouts only clear company→driver residual; never flip a driver_owes week.
  const settlementPaid =
    grossSettlement > 0.005 ? round(Math.min(settlementPaidIn, grossSettlement)) : 0;
  const settlement =
    grossSettlement > 0.005 ? round(grossSettlement - settlementPaid) : grossSettlement;

  return {
    netPayout,
    tollChargedToDriver: tollPersonal,
    tollCashWash,
    cashOwed,
    cashPaid,
    cashBalance,
    adjCashBalance,
    grossSettlement,
    settlementPaid,
    settlement,
  };
}
