/**
 * Dual-ledger fuel eligibility — keep Transaction Logs & Fuel Analytics in sync.
 * Card Inventory owns JAA statement ledger rows; ops surfaces use driver/admin fills only.
 */
import type { FuelEntry } from '../types/fuel';
import { countsInGasCardSpend, isGasCardFuelEntry } from './fuelPaidByDriver';
import { isJaaStatementLedgerRow } from './jaaFuelStatementMatcher';

/** Exclude fees, declines, and awaiting-statement $0 anchors from spend totals. */
export function countsInFuelLogSpend(entry: FuelEntry): boolean {
  const meta = entry.metadata as Record<string, unknown> | undefined;
  if (meta?.jaaRowKind === 'fee' || meta?.jaaRowKind === 'declined') return false;
  if (meta?.awaitingCardStatement) return false;
  if (meta?.countsInFuelSpend === false) return false;
  if (isGasCardFuelEntry(entry)) return countsInGasCardSpend(entry);
  return true;
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

/** Litres for ops analytics — statement ledger litres are excluded (avoids matched-pair double count). */
export function fuelOpsLiters(entry: FuelEntry): number {
  if (!isFuelOpsLogEntry(entry)) return 0;
  return Number(entry.liters) || 0;
}
