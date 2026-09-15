/**
 * Dual-ledger fuel eligibility — Transaction Logs & Fuel Analytics.
 * Card Inventory owns JAA statement ledger rows; ops surfaces use driver/admin fills only.
 */
import { isJaaStatementLedgerRow } from '../../roam-shared/src/fuel/jaaStatementLedger.ts';
import type { FuelEntry } from './fuelTypes.ts';

/** Company / fleet gas-card charges (not driver cash). Explicit paymentSource wins over type. */
export function isGasCardFuelEntry(entry: FuelEntry): boolean {
  if (entry.paymentSource === 'Gas_Card') return true;
  if (
    entry.paymentSource === 'RideShare_Cash' ||
    entry.paymentSource === 'Personal' ||
    entry.paymentSource === 'Petty_Cash'
  ) {
    return false;
  }
  if (entry.type === 'Card_Transaction') return true;
  return false;
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
