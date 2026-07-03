/**
 * The ONE shared per-period settlement calculation — the single source of truth
 * that every driver financial tab (Expenses / Settlement / Payout / Cash Wallet)
 * renders when the unified toll-settlement flag is ON.
 *
 * Locked model (see plan): each toll affects the driver in exactly ONE place.
 *   - Payout   = driverShare − fuelDeduction        (tolls are NOT deducted here)
 *   - Cash side carries all toll effects:
 *       cashOwed  = baseCashOwed + personal tag tolls  (driver owes)
 *       cashPaid  = baseCashPaid + cash-wash tolls      (driver credited)
 *   - Settlement = netPayout − cashBalance
 *
 * `base*` figures are the toll-NEUTRAL physical cash (collected, payments,
 * float, fuel credits) — the toll numbers come from the server's
 * reconciliation-aware disposition, applied here exactly once.
 *
 * Pure + dependency-free so it is unit-testable and identical across tabs.
 */

export interface PeriodSettlementInput {
  driverShare: number;
  fuelDeduction: number;
  /** Toll-neutral physical cash for the period (no toll credit/debit applied). */
  baseCashOwed: number;
  baseCashPaid: number;
  /** Server disposition: cash tolls the driver paid (credit). */
  tollCashWash: number;
  /** Server disposition: personal tag tolls billed to the driver (debit). */
  tollPersonal: number;
}

export interface PeriodSettlementResult {
  netPayout: number;
  tollChargedToDriver: number;
  tollCashWash: number;
  cashOwed: number;
  cashPaid: number;
  cashBalance: number;
  settlement: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computePeriodSettlement(i: PeriodSettlementInput): PeriodSettlementResult {
  const netPayout = round((i.driverShare || 0) - (i.fuelDeduction || 0));
  const tollPersonal = round(Math.max(0, i.tollPersonal || 0));
  const tollCashWash = round(Math.max(0, i.tollCashWash || 0));

  const cashOwed = round((i.baseCashOwed || 0) + tollPersonal);
  const cashPaid = round((i.baseCashPaid || 0) + tollCashWash);
  const cashBalance = round(cashOwed - cashPaid);
  const settlement = round(netPayout - cashBalance);

  return {
    netPayout,
    tollChargedToDriver: tollPersonal,
    tollCashWash,
    cashOwed,
    cashPaid,
    cashBalance,
    settlement,
  };
}
