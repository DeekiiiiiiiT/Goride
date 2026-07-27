/**
 * Locked week settlement components — SSOT with fleet Cash Wallet.
 * Copy of apps/fleet/src/utils/driverSettlementMath.ts — keep in sync.
 */

import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { computePeriodSettlement } from './driverPeriodSettlement';

export function getAdjCashBalance(cashBalance: number, fuelCredits: number): number {
  return cashBalance - (fuelCredits || 0);
}

/**
 * Locked week formula (Financials + Cash Wallet SSOT):
 *
 *   (Passenger cash + Personal toll charged)
 *     − Cash returned (Settlement Week–tagged Log Cash only)
 *     − Fleet fuel credit
 *     − Cash toll wash
 *     − Cash written off
 *     = Cash still held
 *   Net Payout − Cash still held = Settlement
 *     (+ fleet owes driver; − driver owes fleet)
 */
export function getPeriodSettlementComponents(
  row: PayoutPeriodRow,
  opts?: { includeEstimate?: boolean },
): {
  adjCashBalance: number;
  netPayoutApplied: number;
  settlement: number;
} {
  const netPayoutApplied =
    row.isFinalized || (opts?.includeEstimate && row.isEstimate) ? row.netPayout : 0;
  const br = row.cashPaidBreakdown;

  const passengerCash =
    row.passengerCash != null && row.passengerCash > 0.005
      ? row.passengerCash
      : row.cashOwed;

  const cashReturned = Math.max(0, row.cashPaid || 0);

  const washAlreadyInPaid = Math.max(0, br?.tollCredits ?? 0);
  const explicitWash = Math.max(0, row.cashTollWash ?? 0);
  const cashTollWash = Math.max(0, explicitWash - washAlreadyInPaid);

  const tollPersonal = Math.max(0, row.personalTollCharge ?? 0);
  const fuelCredits = Math.max(0, row.fuelCredits || 0);
  const cashWrittenOff = Math.max(0, row.cashWrittenOff || 0);

  const r = computePeriodSettlement({
    driverShare: netPayoutApplied,
    fuelDeduction: 0,
    baseCashOwed: passengerCash,
    baseCashPaid: cashReturned,
    tollCashWash: cashTollWash,
    tollPersonal,
    fuelCredits,
    cashWrittenOff,
  });

  return {
    adjCashBalance: r.adjCashBalance,
    netPayoutApplied,
    settlement: r.settlement,
  };
}

export function aggregateFinalizedNetSettlement(rows: PayoutPeriodRow[]): number {
  return rows
    .filter((r) => r.isFinalized)
    .reduce((sum, r) => sum + getPeriodSettlementComponents(r).settlement, 0);
}

export function countPendingEarningsPeriods(rows: PayoutPeriodRow[]): number {
  return rows.filter((r) => !r.isFinalized).length;
}
