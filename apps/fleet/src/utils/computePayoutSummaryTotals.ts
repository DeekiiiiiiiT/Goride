import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { getPeriodSettlementComponents } from './driverSettlementMath';

export interface PayoutSummaryTotals {
  /** Sum netPayout on fuel-locked weeks (incl. Awaiting Cash / Cash Outstanding). */
  netTakeHome: number;
  /** Sum driver fuel share on fuel-locked weeks. */
  fuelDeducted: number;
  /**
   * Sum Amount Due on open weeks (not Closed).
   * Pending Fuel uses estimate settle when isEstimate; Awaiting Cash uses locked settle.
   */
  openBalance: number;
  fuelLockedCount: number;
  awaitingCashCount: number;
  pendingCount: number;
  closedCount: number;
  totalPeriods: number;
}

/**
 * Paycheck summary cards — Net Take-Home / Fuel use isFinalized (fuel locked),
 * not status === 'Finalized' (cash cleared).
 */
export function computePayoutSummaryTotals(rows: PayoutPeriodRow[]): PayoutSummaryTotals {
  const fuelLocked = rows.filter((r) => r.isFinalized);
  const awaitingCash = rows.filter((r) => r.status === 'Awaiting Cash');
  const pending = rows.filter((r) => r.status === 'Pending');
  const closed = rows.filter((r) => r.status === 'Finalized');

  const netTakeHome = fuelLocked.reduce((s, r) => s + (r.netPayout || 0), 0);
  const fuelDeducted = fuelLocked.reduce((s, r) => s + (r.fuelDeduction || 0), 0);

  let openBalance = 0;
  for (const r of rows) {
    if (r.status === 'Finalized') continue;
    if (r.isFinalized) {
      openBalance += getPeriodSettlementComponents(r).settlement;
    } else if (r.isEstimate) {
      openBalance += getPeriodSettlementComponents(r, { includeEstimate: true }).settlement;
    }
  }

  return {
    netTakeHome: Math.round(netTakeHome * 100) / 100,
    fuelDeducted: Math.round(fuelDeducted * 100) / 100,
    openBalance: Math.round(openBalance * 100) / 100,
    fuelLockedCount: fuelLocked.length,
    awaitingCashCount: awaitingCash.length,
    pendingCount: pending.length,
    closedCount: closed.length,
    totalPeriods: rows.length,
  };
}

/** UI labels for paycheck status (row.status stays Pending / Awaiting Cash / Finalized). */
export function payoutStatusLabel(status: PayoutPeriodRow['status']): string {
  if (status === 'Pending') return 'Pending Fuel';
  if (status === 'Awaiting Cash') return 'Cash Outstanding';
  return 'Closed';
}
