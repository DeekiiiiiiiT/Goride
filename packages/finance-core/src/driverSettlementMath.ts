import { computePeriodSettlement } from './driverPeriodSettlement.ts';
import type { SettlementPeriodRow } from './types.ts';

/** Still-held after fuel credits and write-offs (matches computePeriodSettlement adjCash). */
export function getAdjCashBalance(
  cashBalance: number,
  fuelCredits: number,
  cashWrittenOff = 0,
): number {
  return cashBalance - (fuelCredits || 0) - (cashWrittenOff || 0);
}

export function getPeriodSettlementComponents(
  row: SettlementPeriodRow,
  opts?: { includeEstimate?: boolean },
): {
  adjCashBalance: number;
  netPayoutApplied: number;
  settlement: number;
  grossSettlement: number;
  settlementPaid: number;
  overpaidAmount: number;
} {
  const netPayoutApplied =
    row.isFinalized || (opts?.includeEstimate && row.isEstimate) ? row.netPayout : 0;

  const passengerCash =
    row.passengerCash != null && row.passengerCash > 0.005
      ? row.passengerCash
      : row.cashOwed;

  const cashReturned = Math.max(0, row.cashPaid || 0);
  // Row builders already produce cashTollWash as the settlement credit (single netting).
  // Do not subtract cashPaidBreakdown.tollCredits again.
  const tollCashWash = Math.max(0, row.cashTollWash ?? 0);
  const tollPersonal = Math.max(0, row.personalTollCharge ?? 0);
  const fuelCredits = Math.max(0, row.fuelCredits || 0);
  const cashWrittenOff = Math.max(0, row.cashWrittenOff || 0);
  const settlementPaid = Math.max(0, row.settlementPaid || 0);

  const r = computePeriodSettlement({
    driverShare: netPayoutApplied,
    fuelDeduction: 0,
    baseCashOwed: passengerCash,
    baseCashPaid: cashReturned,
    tollCashWash,
    tollPersonal,
    fuelCredits,
    cashWrittenOff,
    settlementPaid,
  });

  return {
    adjCashBalance: r.adjCashBalance,
    netPayoutApplied,
    settlement: r.settlement,
    grossSettlement: r.grossSettlement,
    settlementPaid: r.settlementPaid,
    overpaidAmount: r.overpaidAmount,
  };
}

export function aggregateFinalizedNetSettlement(rows: SettlementPeriodRow[]): number {
  return rows
    .filter((r) => r.isFinalized)
    .reduce((sum, r) => sum + getPeriodSettlementComponents(r).settlement, 0);
}

export function countPendingEarningsPeriods(rows: SettlementPeriodRow[]): number {
  return rows.filter((r) => !r.isFinalized).length;
}
