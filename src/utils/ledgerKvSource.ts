/**
 * KV prefix for list/count/summary ledger APIs.
 * Canonical money events live under `ledger_event:*`; legacy under `ledger:%`.
 */
export type LedgerKvSource = 'canonical' | 'legacy';

export function ledgerKeyLikePrefix(source: LedgerKvSource): string {
  return source === 'canonical' ? 'ledger_event:%' : 'ledger:%';
}

/**
 * Resolves `?source=` for GET /ledger, /ledger/count, /ledger/summary.
 * Default **canonical** (`ledger_event:*`). Use `legacy` for emergency rollback.
 */
export function resolveLedgerApiSourceParam(raw: string | undefined | null): LedgerKvSource {
  const s = String(raw ?? '')
    .toLowerCase()
    .trim();
  if (s === 'legacy' || s === 'ledger' || s === 'ledger_legacy') return 'legacy';
  return 'canonical';
}

/** `GET /ledger/diagnostic-trip-ledger-gap` — which fare rows to compare to trips. */
export type TripLedgerGapSourceMode = 'canonical' | 'legacy' | 'both';

/**
 * Default **canonical** (`ledger_event:*` fare_earning). **`legacy`** = `ledger:%`.
 * **`both`** runs two comparisons (canonical + legacy) in one response.
 */
export function resolveTripLedgerGapSourceParam(raw: string | undefined | null): TripLedgerGapSourceMode {
  const s = String(raw ?? '')
    .toLowerCase()
    .trim();
  if (s === 'legacy' || s === 'ledger' || s === 'ledger_legacy') return 'legacy';
  if (s === 'both' || s === 'compare' || s === 'all') return 'both';
  return 'canonical';
}
