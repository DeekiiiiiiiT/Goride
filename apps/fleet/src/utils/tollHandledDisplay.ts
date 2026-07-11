/**
 * Display-side "handled" rule for toll rows returned by GET /toll-logs
 * (tollLedgerToTxShape). Mirrors the server mapper in
 * apps/fleet/src/supabase/functions/server/toll_controller.tsx so Expenses
 * Toll Status and classifyTollLedgerEntry agree with toll_ledger SSOT.
 *
 * A toll is handled when the ledger flag says so, OR when status / resolution /
 * trip link already imply it was settled (legacy rows that never flipped the flag).
 */

export interface TollHandledLedgerFields {
  isReconciled?: boolean | null;
  status?: string | null;
  resolution?: string | null;
  tripId?: string | null;
}

export function deriveTollTxIsReconciled(entry: TollHandledLedgerFields): boolean {
  const status = (entry.status || '').toLowerCase();
  return !!(
    entry.isReconciled ||
    status === 'reconciled' ||
    status === 'resolved' ||
    entry.resolution ||
    entry.tripId
  );
}
