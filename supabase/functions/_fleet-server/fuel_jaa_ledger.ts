/**
 * Server mirror entry — prefer packages/roam-shared leaf for Deno edge bundling.
 * Keep extra Gas Card helpers here; ledger-row detection is shared.
 */

export {
  isJaaStatementLedgerRow,
  STATEMENT_IMPORT_SOURCES,
} from "../../../packages/roam-shared/src/fuel/jaaStatementLedger.ts";

function metaOf(entry: Record<string, unknown>): Record<string, unknown> {
  const m = entry?.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
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
