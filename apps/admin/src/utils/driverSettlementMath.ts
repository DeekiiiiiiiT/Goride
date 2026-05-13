import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';

/**
 * Matches PayoutPeriodDetail: cash still held after fuel credit, before netting earnings.
 */
export function getAdjCashBalance(cashBalance: number, fuelCredits: number): number {
  return cashBalance - (fuelCredits || 0);
}

/**
 * Settlement = Adj. cash balance − net payout (earnings owed to driver), when fuel/earnings row is finalized.
 * Same as PayoutPeriodDetail: netPayout treated as 0 until isFinalized.
 */
export function getPeriodSettlementComponents(row: PayoutPeriodRow): {
  adjCashBalance: number;
  netPayoutApplied: number;
  settlement: number;
} {
  const netPayout = row.isFinalized ? row.netPayout : 0;
  const adjCashBalance = getAdjCashBalance(row.cashBalance, row.fuelCredits);
  const settlement = adjCashBalance - netPayout;
  return { adjCashBalance, netPayoutApplied: netPayout, settlement };
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
