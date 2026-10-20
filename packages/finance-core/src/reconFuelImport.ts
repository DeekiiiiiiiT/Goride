/**
 * Staged self-serve fuel statement row classification (P8).
 */
import { periodKeyFor } from './periodKey.ts';

export type StagedFuelRowClassification =
  | 'new'
  | 'duplicate_receipt'
  | 'rejected'
  | 'spill';

export type FuelImportRowLike = {
  id?: string;
  date?: string | null;
  amount?: number;
  metadata?: Record<string, unknown>;
};

export function fuelReceiptKey(row: FuelImportRowLike): string | null {
  const meta = row.metadata || {};
  const r = meta.jaaReceiptNumber ?? meta.receiptNumber;
  if (r == null || String(r).trim() === '') return null;
  return String(r).trim().toUpperCase();
}

export function classifyFuelImportRow(
  row: FuelImportRowLike,
  existingReceipts: ReadonlySet<string>,
  opts: { selectedWeekKey?: string | null; fleetTz?: string },
): StagedFuelRowClassification {
  const day = row.date != null ? String(row.date).slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'rejected';

  const weekKey = periodKeyFor(day, opts.fleetTz || 'America/Jamaica');
  if (opts.selectedWeekKey && weekKey !== opts.selectedWeekKey.slice(0, 10)) {
    return 'spill';
  }

  const receipt = fuelReceiptKey(row);
  if (receipt && existingReceipts.has(receipt)) return 'duplicate_receipt';

  return 'new';
}

export { stagingRowOverrideId, parseStagingRowOverrideId } from './reconTollImport.ts';
