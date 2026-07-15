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
 * Fuel credits already counted inside cashPaid (Cash Wallet) must not be
 * subtracted again here — otherwise Cash Still Held / Settlement double-credit fuel.
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
  const br = row.cashPaidBreakdown;
  const fuelInPaid = br?.fuelCreditsInCashPaid ?? 0;
  const tollInPaid = br?.tollCredits ?? 0;
  const handbacks =
    (br?.allocatedPayments ?? 0) + (br?.fifoPayments ?? 0) + (br?.surplusPayments ?? 0);

  // Prefer reconstruct from parts so fleet fuel credit is never under-applied when a
  // partial Fuel Reimbursement sits inside cashPaid (Kenny: $2k vs $21k companyShare).
  if (
    row.cashOwed > 0.005 &&
    br &&
    (handbacks > 0.005 || fuelInPaid > 0.005 || tollInPaid > 0.005 || (row.fuelCredits || 0) > 0.005)
  ) {
    const fuelCredits = Math.max(row.fuelCredits || 0, fuelInPaid);
    // cashPaid may already include fuel + toll credits and/or cash-wash from unified rows.
    const tollAlreadyInCashPaidRow = Math.max(0, (row.cashPaid || 0) - handbacks - fuelInPaid);
    const tollCredit = Math.max(tollInPaid, tollAlreadyInCashPaidRow);
    const r = computePeriodSettlement({
      driverShare: netPayoutApplied,
      fuelDeduction: 0,
      baseCashOwed: row.cashOwed,
      baseCashPaid: handbacks,
      tollCashWash: tollCredit,
      tollPersonal: 0,
      fuelCredits,
    });
    return { adjCashBalance: r.adjCashBalance, netPayoutApplied, settlement: r.settlement };
  }

  // Legacy fallback: cashBalance already nets paid; subtract remaining fuel credit only.
  const fuelCreditsForAdj = Math.max(0, (row.fuelCredits || 0) - fuelInPaid);
  const r = computePeriodSettlement({
    driverShare: netPayoutApplied,
    fuelDeduction: 0,
    baseCashOwed: row.cashBalance,
    baseCashPaid: 0,
    tollCashWash: 0,
    tollPersonal: 0,
    fuelCredits: fuelCreditsForAdj,
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
