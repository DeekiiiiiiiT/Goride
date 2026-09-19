/**
 * Dual-ledger fuel eligibility — Transaction Logs & Fuel Analytics.
 * Card Inventory owns JAA statement ledger rows; ops surfaces use driver/admin fills only.
 */
import { isJaaStatementLedgerRow } from '../../roam-shared/src/fuel/jaaStatementLedger.ts';
import type { FuelEntry } from './fuelTypes.ts';
import {
  isGasCardFuelEntry as isGasCardFuelEntryCore,
  isOutOfPocketFuelEntry as isOutOfPocketFuelEntryCore,
} from './fuelPaymentSource.ts';

// Public barrel: consumers often import this next to fuelOps helpers from @roam/fuel-core.
export { isJaaStatementLedgerRow };

/** Company / fleet gas-card charges — F-6 normalize-then-partition (fuelPaymentSource). */
export function isGasCardFuelEntry(entry: FuelEntry): boolean {
  return isGasCardFuelEntryCore(entry);
}

/** Driver cash at the pump — F-6 partition peer of isGasCardFuelEntry. */
export function isOutOfPocketFuelEntry(entry: FuelEntry): boolean {
  return isOutOfPocketFuelEntryCore(entry);
}

/** Approved JAA fuel spend only — excludes fees, declines, and $0 awaiting-statement anchors. */
export function countsInGasCardSpend(entry: FuelEntry): boolean {
  if (!isGasCardFuelEntry(entry)) return false;
  const meta = entry.metadata as Record<string, unknown> | undefined;
  if (meta?.jaaRowKind === 'fee' || meta?.jaaRowKind === 'declined') return false;
  if (meta?.countsInFuelSpend === false) return false;
  if (meta?.awaitingCardStatement) return false;
  const amt = Number(entry.amount) || 0;
  return amt > 0;
}

/** Exclude fees, declines, and awaiting-statement $0 anchors from spend totals. */
export function countsInFuelLogSpend(entry: FuelEntry): boolean {
  const meta = entry.metadata as Record<string, unknown> | undefined;
  if (meta?.jaaRowKind === 'fee' || meta?.jaaRowKind === 'declined') return false;
  if (meta?.awaitingCardStatement) return false;
  if (meta?.awaitingCashStatement) return false;
  if (meta?.countsInFuelSpend === false) return false;
  if (isGasCardFuelEntry(entry)) return countsInGasCardSpend(entry);
  return true;
}

/** Driver out-of-pocket amount that counts toward Cash tile (F-6c). */
export function fuelOpsCashAmount(entry: FuelEntry): number {
  if (!isFuelOpsLogEntry(entry) || !countsInFuelLogSpend(entry)) return 0;
  if (!isOutOfPocketFuelEntry(entry)) return 0;
  return Number(entry.amount) || 0;
}

/** Driver/admin/portal fills only — not JAA/CSV statement ledger (Card Inventory). */
export function isFuelOpsLogEntry(entry: FuelEntry): boolean {
  return !isJaaStatementLedgerRow(entry);
}

export function filterFuelOpsLogEntries(entries: FuelEntry[]): FuelEntry[] {
  return entries.filter(isFuelOpsLogEntry);
}

/** Amount that counts toward ops fuel spend (Logs Total Spend / Analytics Total Fuel Cost). */
export function fuelOpsSpendAmount(entry: FuelEntry): number {
  if (!isFuelOpsLogEntry(entry) || !countsInFuelLogSpend(entry)) return 0;
  return Number(entry.amount) || 0;
}

/**
 * Litres for ops analytics / JMD/L.
 * Spend-eligible rows count as today; split volume-owner awaiting cash still counts
 * pump liters (tank truth) without counting spend until statement sets cash amount.
 */
export function fuelOpsLiters(entry: FuelEntry): number {
  if (!isFuelOpsLogEntry(entry)) return 0;
  const meta = entry.metadata as Record<string, unknown> | undefined;
  const liters = Number(entry.liters) || 0;
  if (liters <= 0) return 0;
  if (countsInFuelLogSpend(entry)) return liters;
  // Split cash volume owner waiting on statement — liters known at pump
  if (
    meta?.awaitingCashStatement === true &&
    meta?.splitVolumeOwner === true &&
    typeof meta?.fillGroupId === 'string' &&
    meta.fillGroupId.length > 0
  ) {
    return liters;
  }
  return 0;
}

/** @deprecated Alias — use fuelOpsLiters (now spend-eligible). */
export function fuelOpsPriceLiters(entry: FuelEntry): number {
  return fuelOpsLiters(entry);
}
