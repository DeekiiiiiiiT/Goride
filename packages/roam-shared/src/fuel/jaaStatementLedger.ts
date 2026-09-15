/**
 * JAA/CSV statement ledger row detection (Card Inventory vs driver Logs).
 * Leaf module — no package aliases — safe for Deno edge bundling via relative import.
 */

export const STATEMENT_IMPORT_SOURCES = new Set([
  'jaa_raw',
  'jaa_statement_details',
  'fuel_statement',
]);

export type JaaLedgerEntryLike = {
  entrySource?: string;
  metadata?: Record<string, unknown> | null;
};

/** True for JAA/CSV statement ledger rows (Card Inventory), not driver Logs. */
export function isJaaStatementLedgerRow(entry: JaaLedgerEntryLike): boolean {
  const m = (entry.metadata || {}) as Record<string, unknown>;
  const importSource = String(m.importSource || '');
  if (STATEMENT_IMPORT_SOURCES.has(importSource)) return true;
  if (m.jaaRowKind != null && entry.entrySource !== 'driver-portal') return true;
  return false;
}
