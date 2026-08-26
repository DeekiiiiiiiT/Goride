import { isVoidedTx } from './tollTagLedger';

export interface TollStatusInput {
  status?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * A soft-voided row keeps whatever status it had before the void, so the void
 * has to win the label — otherwise a reversed toll renders as "Completed" and
 * silently reads as real spend.
 */
export function resolveTollStatusDisplay(tx: TollStatusInput): string {
  if (isVoidedTx(tx as any)) return 'Voided';
  const status = tx.status || '';
  switch (status) {
    case 'Completed':
    case 'Pending':
    case 'Failed':
    case 'Reconciled':
    case 'Verified':
    case 'Approved':
    case 'Rejected':
    case 'Flagged':
      return status;
    case 'Void':
    case 'Voided':
      return 'Voided';
    default:
      return status || 'Unknown';
  }
}

/** Voided rows stay visible in listings but are excluded from every money total. */
export function excludeVoided<T extends { isVoided: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => !r.isVoided);
}
