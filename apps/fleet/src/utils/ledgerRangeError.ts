/** User-facing copy when a ledger/finance fetch fails because the date window is too wide. */
export const LEDGER_RANGE_TOO_LARGE_COPY = 'This range is too large — narrow the dates';

export function isLedgerRangeTooLargeError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (!msg) return false;
  if (msg.includes('statement_timeout')) return true;
  if (msg.includes('timeout') && (msg.includes('ledger') || msg.includes('range') || msg.includes('query'))) {
    return true;
  }
  if (msg.includes('too large')) return true;
  if (msg.includes('range') && (msg.includes('large') || msg.includes('narrow') || msg.includes('exceed'))) {
    return true;
  }
  return false;
}

export function ledgerFetchErrorCopy(err: unknown, fallback = 'Failed to load ledger data'): string {
  if (isLedgerRangeTooLargeError(err)) return LEDGER_RANGE_TOO_LARGE_COPY;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
