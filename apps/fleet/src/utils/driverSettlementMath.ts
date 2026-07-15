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
 *   Passenger cash − Cash returned − Fleet fuel credit − Cash toll wash
 *     = Cash still held
 *   Net Payout − Cash still held
 *     = Settlement (+ fleet owes driver; − driver owes fleet)
 *
 * Cash returned is the full Cash Paid / Cash Returned column (includes any $2k
 * fuel reimbursement payment). Fleet fuel credit is the full finalized
 * companyShare — do NOT reduce it by fuel already inside Cash Paid (those are
 * different credits: cash handed back vs fuel spend attribution).
 *
 * Sign convention: positive settlement = company owes the driver.
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

  // Full Cash Returned column — never strip fuel reimbursements out of handbacks.
  const cashReturned = Math.max(0, row.cashPaid || 0);

  // Cash plaza tolls: prefer explicit field; else breakdown toll credits already
  // counted inside cashReturned (avoid double-credit).
  const washAlreadyInPaid = Math.max(0, br?.tollCredits ?? 0);
  const explicitWash = Math.max(0, row.cashTollWash ?? 0);
  const cashTollWash = Math.max(0, explicitWash - washAlreadyInPaid);

  const fuelCredits = Math.max(0, row.fuelCredits || 0);

  const r = computePeriodSettlement({
    driverShare: netPayoutApplied,
    fuelDeduction: 0,
    baseCashOwed: passengerCash,
    baseCashPaid: cashReturned,
    tollCashWash: cashTollWash,
    tollPersonal: 0,
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
