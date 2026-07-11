import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { computePeriodSettlement } from './driverPeriodSettlement';

/**
 * Matches PayoutPeriodDetail: cash still held after fuel credit, before netting earnings.
 */
export function getAdjCashBalance(cashBalance: number, fuelCredits: number): number {
  return cashBalance - (fuelCredits || 0);
}

/**
 * Settlement components for one payout period, delegating to
 * driverPeriodSettlement.ts's computePeriodSettlement — the canonical, tested
 * settlement formula also used by SettlementSummaryView and
 * buildLedgerPayoutPeriodRows. This function used to have its own competing
 * formula (settlement = adjCashBalance − netPayout, the inverse sign of the
 * canonical settlement = netPayout − adjCashBalance), so the same driver/period
 * could show opposite-signed "Settlement" figures depending which tab you were
 * on. It's now a thin adapter: row.netPayout/row.cashBalance are already the
 * final, policy-correct values computed upstream (toll disposition may already
 * be applied depending on the unifiedToll flag), so they're passed through
 * computePeriodSettlement's driverShare/baseCashOwed slots (with fuelDeduction
 * and toll terms zeroed) purely to reuse its netPayout-minus-fuel-credit-
 * adjusted-cash-balance arithmetic without re-deriving toll policy here.
 *
 * Sign convention (matches computePeriodSettlement): positive settlement =
 * company owes the driver; negative = driver owes the company. netPayout is
 * treated as 0 until the period is finalized.
 */
export function getPeriodSettlementComponents(row: PayoutPeriodRow): {
  adjCashBalance: number;
  netPayoutApplied: number;
  settlement: number;
} {
  const netPayoutApplied = row.isFinalized ? row.netPayout : 0;
  const r = computePeriodSettlement({
    driverShare: netPayoutApplied,
    fuelDeduction: 0,
    baseCashOwed: row.cashBalance,
    baseCashPaid: 0,
    tollCashWash: 0,
    tollPersonal: 0,
    fuelCredits: row.fuelCredits,
  });
  return { adjCashBalance: r.adjCashBalance, netPayoutApplied, settlement: r.settlement };
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
