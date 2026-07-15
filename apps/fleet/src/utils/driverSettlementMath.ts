import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { computePeriodSettlement } from './driverPeriodSettlement';

/**
 * Matches PayoutPeriodDetail: cash still held after fuel credit, before netting earnings.
 */
export function getAdjCashBalance(cashBalance: number, fuelCredits: number): number {
  return cashBalance - (fuelCredits || 0);
}

/**
 * Locked week formula (Financials + Cash Wallet SSOT):
 *
 *   (Passenger cash + Personal toll charged)
 *     − Cash returned (Settlement Week–tagged Log Cash only)
 *     − Fleet fuel credit (Fuel Reconciliation companyShare)
 *     − Cash toll wash (cash plaza from Toll Reconciliation)
 *     = Cash still held
 *   Net Payout − Cash still held
 *     = Settlement (+ fleet owes driver; − driver owes fleet)
 *
 * Sign convention: positive settlement = company owes the driver.
 * Fleet Financials bank confirms / bank CSV match must NEVER feed this function.
 */
export function getPeriodSettlementComponents(row: PayoutPeriodRow): {
  adjCashBalance: number;
  netPayoutApplied: number;
  settlement: number;
} {
  const netPayoutApplied = row.isFinalized ? row.netPayout : 0;
  const br = row.cashPaidBreakdown;

  const passengerCash =
    row.passengerCash != null && row.passengerCash > 0.005
      ? row.passengerCash
      : row.cashOwed;

  // Cash Returned = Settlement Week–tagged cash payments only (never fuel/toll).
  const cashReturned = Math.max(0, row.cashPaid || 0);

  // Cash plaza tolls: prefer explicit field; else breakdown toll credits already
  // counted inside cashReturned (avoid double-credit).
  const washAlreadyInPaid = Math.max(0, br?.tollCredits ?? 0);
  const explicitWash = Math.max(0, row.cashTollWash ?? 0);
  const cashTollWash = Math.max(0, explicitWash - washAlreadyInPaid);

  // Personal tag tolls from Toll Reconciliation disposition.
  const tollPersonal = Math.max(0, row.personalTollCharge ?? 0);

  const fuelCredits = Math.max(0, row.fuelCredits || 0);

  const r = computePeriodSettlement({
    driverShare: netPayoutApplied,
    fuelDeduction: 0,
    baseCashOwed: passengerCash,
    baseCashPaid: cashReturned,
    tollCashWash: cashTollWash,
    tollPersonal,
    fuelCredits,
  });

  return {
    adjCashBalance: r.adjCashBalance,
    netPayoutApplied,
    settlement: r.settlement,
  };
}

/** Sum settlement across periods with finalized fuel/earnings (same rows included in Payout detail settlement). */
export function aggregateFinalizedNetSettlement(rows: PayoutPeriodRow[]): number {
  return rows
    .filter((r) => r.isFinalized)
    .reduce((sum, r) => sum + getPeriodSettlementComponents(r).settlement, 0);
}

export function countPendingEarningsPeriods(rows: PayoutPeriodRow[]): number {
  return rows.filter((r) => !r.isFinalized).length;
}
