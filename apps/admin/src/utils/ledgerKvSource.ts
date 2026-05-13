/**
 * Canonical money events (`ledger_event:*`). Legacy `ledger:%` list reads are removed.
 */
export const CANONICAL_LEDGER_KEY_LIKE = "ledger_event:%" as const;

/**
 * Resolves `?source=` for GET /ledger and /ledger/summary (ignored — canonical only).
 */
export function resolveLedgerApiSourceParam(_raw: string | undefined | null): "canonical" {
  return "canonical";
}
