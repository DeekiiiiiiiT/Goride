import type { GctRateRow, GctSupplyClass } from './types.ts';
import { isTaxableClass } from './supplyClasses.ts';

function toDateOnly(isoOrDate: string | Date): string {
  if (typeof isoOrDate === 'string') {
    return isoOrDate.slice(0, 10);
  }
  return isoOrDate.toISOString().slice(0, 10);
}

/**
 * Resolve rate for a supply class as of a calendar date.
 * Append-only rows: picks the row with effectiveFrom <= asOf and (effectiveTo null or >= asOf),
 * preferring the latest effectiveFrom.
 */
export function resolveRatePercentAsOf(
  rows: GctRateRow[],
  supplyClass: GctSupplyClass,
  asOf: string | Date,
): number {
  if (!isTaxableClass(supplyClass)) return 0;

  const asOfDay = toDateOnly(asOf);
  const candidates = rows
    .filter((r) => r.supplyClass === supplyClass)
    .filter((r) => r.effectiveFrom <= asOfDay)
    .filter((r) => r.effectiveTo == null || r.effectiveTo >= asOfDay)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  if (candidates.length === 0) {
    throw new Error(`No GCT rate for class=${supplyClass} asOf=${asOfDay}`);
  }
  return candidates[0].ratePercent;
}

export function tryResolveRatePercentAsOf(
  rows: GctRateRow[],
  supplyClass: GctSupplyClass,
  asOf: string | Date,
): number | null {
  try {
    return resolveRatePercentAsOf(rows, supplyClass, asOf);
  } catch {
    return null;
  }
}
