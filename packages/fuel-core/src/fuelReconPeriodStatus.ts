/**
 * Fuel Expenses status from Consumption Reconciliation period lock (toll-sync pattern).
 * Finalized only when the fleet week is locked — not when driver fuel money was merely posted.
 */

export type FuelReconPeriodLockRow = {
  status?: string | null;
  lockedAt?: string | null;
};

export type FuelExpenseStatus = 'n/a' | 'pending' | 'in_progress' | 'finalized';

export function isFuelReconPeriodLocked(row?: FuelReconPeriodLockRow | null): boolean {
  if (!row) return false;
  if (row.lockedAt) return true;
  return String(row.status || '').toLowerCase() === 'locked';
}

/**
 * @param hasFuelActivity — this driver-week has fuel money/events/spend
 * @param reconRow — org fuel_reconciliation_period for that Monday (may be missing)
 */
export function deriveFuelExpenseStatus(
  hasFuelActivity: boolean,
  reconRow?: FuelReconPeriodLockRow | null,
): FuelExpenseStatus {
  if (isFuelReconPeriodLocked(reconRow)) return 'finalized';
  if (!hasFuelActivity) return 'n/a';
  if (!reconRow) return 'pending';
  const st = String(reconRow.status || '').toLowerCase();
  if (st === 'open' || st === 'in_review' || st === 'ready' || st === 'reopened') {
    return 'in_progress';
  }
  return 'pending';
}

export function fuelExpenseStatusIsFinalized(status: FuelExpenseStatus | string): boolean {
  return String(status || '').toLowerCase() === 'finalized';
}

/** Expenses / CSV badge text. */
export function fuelExpenseStatusLabel(status: FuelExpenseStatus | string): string {
  switch (String(status || '').toLowerCase()) {
    case 'finalized':
      return 'Finalized';
    case 'in_progress':
      return 'In Progress';
    case 'pending':
      return 'Pending';
    default:
      return '—';
  }
}
