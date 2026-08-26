/**
 * Display-side "handled" rule for toll rows returned by GET /toll-logs
 * (tollLedgerToTxShape). Mirrors the server mapper in
 * supabase/functions/_fleet-server/toll_controller.tsx so Expenses /
 * Settlement Toll Status agree with Toll Reconciliation period landing.
 *
 * A toll is handled when:
 * - voided (duplicate soft-delete — must not keep Expenses "Unmatched"), OR
 * - ledger isReconciled / status / resolution / trip link say so, OR
 * - workflowStage is a terminal wizard stage (same set that clears Outstanding
 *   on GET /toll-periods — claim_filed, matched, *_resolved). Without this,
 *   Settlement showed "1 Unmatched" while Toll Reconciliation showed Completed.
 */

export interface TollHandledLedgerFields {
  isReconciled?: boolean | null;
  status?: string | null;
  resolution?: string | null;
  tripId?: string | null;
  workflowStage?: string | null;
  metadata?: { voided?: boolean | null } | null;
}

/** Stages that do not keep a period in Outstanding (toll_period_controller). */
const TERMINAL_WORKFLOW_STAGES = new Set([
  'matched',
  'claim_filed',
  'claim_resolved',
  'personal_use_resolved',
  'deadhead_resolved',
]);

export function deriveTollTxIsReconciled(entry: TollHandledLedgerFields): boolean {
  const status = (entry.status || '').toLowerCase();
  // Soft-voided duplicates (amount zeroed) are done — do not count as Unmatched.
  if (status === 'voided' || entry.metadata?.voided === true) return true;
  if (entry.workflowStage && TERMINAL_WORKFLOW_STAGES.has(String(entry.workflowStage))) {
    return true;
  }
  return !!(
    entry.isReconciled ||
    status === 'reconciled' ||
    status === 'resolved' ||
    status === 'completed' || // legacy Toll Charge / ops rows
    entry.resolution ||
    entry.tripId
  );
}
