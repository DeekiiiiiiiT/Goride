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
