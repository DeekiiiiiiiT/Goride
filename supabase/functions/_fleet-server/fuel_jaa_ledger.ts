/**
 * Server mirror of packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts ledger rules.
 * Keep isJaaStatementLedgerRow logic in sync with roam-shared.
 */

const STATEMENT_IMPORT_SOURCES = new Set([
  "jaa_raw",
  "jaa_statement_details",
  "fuel_statement",
]);

function metaOf(entry: Record<string, unknown>): Record<string, unknown> {
  const m = entry?.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

/** JAA/CSV statement ledger rows — Card Inventory only, not tank cycle volume. */
export function isJaaStatementLedgerRow(entry: Record<string, unknown>): boolean {
  const m = metaOf(entry);
  const importSource = String(m.importSource || "");
  if (STATEMENT_IMPORT_SOURCES.has(importSource)) return true;
  const rowKind = m.jaaRowKind;
  const entrySource = entry.entrySource ?? m.entrySource;
  if (rowKind != null && entrySource !== "driver-portal") return true;
  return false;
}

export function isDeclinedOrFeeRow(entry: Record<string, unknown>): boolean {
  const kind = String(metaOf(entry).jaaRowKind || "").toLowerCase();
  return kind === "declined" || kind === "fee";
}

/** Linked admin anchor ↔ statement pair — suppress card frequency false positives. */
export function isLinkedGasCardPair(entry: Record<string, unknown>): boolean {
  const m = metaOf(entry);
  return !!(m.jaaMatchedStatementId || m.jaaMatchedDriverEntryId);
}

export function isGasCardAdminAnchor(entry: Record<string, unknown>): boolean {
  const pay = String(entry.paymentSource || metaOf(entry).paymentSource || "");
  const type = String(entry.type || "");
  const mode = String(entry.entryMode || metaOf(entry).entryMode || "");
  return (
    (pay === "Gas_Card" || pay === "company_card") &&
    (type === "Manual_Entry" || mode === "Anchor")
  );
}
