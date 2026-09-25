/**
 * Late rematch: when a gas-card ops log is saved after the CSV, re-run the
 * same matcher used on import so Unmatched statements can become Matched
 * without re-importing.
 *
 * Also heals stale links: ops log has jaaMatchedStatementId pointing at a
 * statement that no longer exists (CSV purge/re-import), so the live
 * statement stays Unmatched forever unless we clear the dead pointer.
 */
import type { FuelEntry } from '../types/fuel';
import {
  buildJaaMatchUpdates,
  isJaaStatementLedgerRow,
  type FuelMatchPair,
} from './jaaFuelStatementMatcher';

function metaOf(e: FuelEntry): Record<string, unknown> {
  return (e.metadata || {}) as Record<string, unknown>;
}

function isGasCardOpsShape(entry: FuelEntry): boolean {
  if (isJaaStatementLedgerRow(entry)) return false;
  if (entry.paymentSource === 'Gas_Card') return true;
  if (entry.type === 'Card_Transaction' && entry.entrySource === 'driver-portal') return true;
  const ps = String(metaOf(entry).paymentSource || '').toLowerCase();
  return ps === 'company_card' || ps === 'gas_card' || metaOf(entry).awaitingCardStatement === true;
}

/** True when jaaMatchedStatementId points at a row that is not in `statements`. */
export function hasStaleStatementLink(
  entry: FuelEntry,
  statements: FuelEntry[],
): boolean {
  const sid = metaOf(entry).jaaMatchedStatementId;
  if (!sid) return false;
  const id = String(sid);
  return !statements.some((s) => s.id === id);
}

/** Strip a dead statement pointer so the matcher will consider this log again. */
export function clearStaleStatementLinkForMatch(
  entry: FuelEntry,
  statements: FuelEntry[],
): FuelEntry {
  if (!hasStaleStatementLink(entry, statements)) return entry;
  const nextMeta = { ...metaOf(entry) };
  delete nextMeta.jaaMatchedStatementId;
  return { ...entry, metadata: nextMeta };
}

/** True for gas-card ops logs that still need a live statement link. */
export function shouldRematchAfterGasCardLogSave(
  entry: FuelEntry,
  statements: FuelEntry[] = [],
): boolean {
  if (!entry?.id) return false;
  if (!isGasCardOpsShape(entry)) return false;
  if (metaOf(entry).jaaMatchedStatementId) {
    return statements.length > 0 && hasStaleStatementLink(entry, statements);
  }
  return true;
}

export function pairsToApplyFromRematch(
  pairs: FuelMatchPair<FuelEntry>[],
): FuelMatchPair<FuelEntry>[] {
  return pairs.filter(
    (p) =>
      (p.status === 'matched' || p.status === 'amount_mismatch') &&
      p.notes !== 'Already linked' &&
      p.statementEntry &&
      p.driverEntry,
  );
}

/**
 * Given a newly saved ops log + period entries + cards, return auto-apply pairs.
 * Ambiguous pairs are left for Accept/Link in the UI.
 */
export function buildRematchApplyPairs(
  savedLog: FuelEntry,
  periodEntries: FuelEntry[],
  cards: { id: string; assignedVehicleId?: string | null }[] = [],
): FuelMatchPair<FuelEntry>[] {
  const statements = periodEntries.filter(isJaaStatementLedgerRow);
  if (!shouldRematchAfterGasCardLogSave(savedLog, statements)) return [];
  if (statements.length === 0) return [];

  const healedLog = clearStaleStatementLinkForMatch(savedLog, statements);
  const all = periodEntries.map((e) =>
    e.id === healedLog.id ? healedLog : clearStaleStatementLinkForMatch(e, statements),
  );
  if (!all.some((e) => e.id === healedLog.id)) all.push(healedLog);

  const { pairs } = buildJaaMatchUpdates(statements, all, cards);
  // Only pairs that involve this log (avoid applying unrelated matches mid-save)
  return pairsToApplyFromRematch(pairs).filter((p) => p.driverEntry?.id === savedLog.id);
}
