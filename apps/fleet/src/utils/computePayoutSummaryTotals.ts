import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { getPeriodSettlementComponents } from './driverSettlementMath';

export interface PayoutSummaryTotals {
  /** Sum netPayout on fuel-locked weeks (incl. Awaiting Cash / Cash Outstanding). */
  netTakeHome: number;
  /** Sum driver fuel share on fuel-locked weeks. */
  fuelDeducted: number;
  /**
   * Sum of absolute unsettled residuals (never nets opposing weeks to $0).
   * Pending Fuel uses estimate settle when isEstimate; Awaiting Cash uses locked settle.
   */
  openBalance: number;
  /** Company-owes side of open weeks (positive settlements). */
  openCompanyOwes: number;
  /** Driver-owes side of open weeks (absolute of negative settlements). */
  openDriverOwes: number;
  fuelLockedCount: number;
  awaitingCashCount: number;
  pendingCount: number;
  closedCount: number;
  totalPeriods: number;
}

/**
 * Paycheck summary cards — Net Take-Home / Fuel use isFinalized (money unlocked),
 * not status === 'Finalized' (cash cleared).
 */
export function computePayoutSummaryTotals(rows: PayoutPeriodRow[]): PayoutSummaryTotals {
  const fuelLocked = rows.filter((r) => r.isFinalized);
  const awaitingCash = rows.filter((r) => r.status === 'Awaiting Cash');
  const pending = rows.filter(
    (r) => r.status === 'Pending' || r.status === 'Awaiting Tolls',
  );
  const closed = rows.filter((r) => r.status === 'Finalized');

  const netTakeHome = fuelLocked.reduce((s, r) => s + (r.netPayout || 0), 0);
  const fuelDeducted = fuelLocked.reduce((s, r) => s + (r.fuelDeduction || 0), 0);

  let openCompanyOwes = 0;
  let openDriverOwes = 0;
  for (const r of rows) {
    if (r.status === 'Finalized') continue;
    let settlement = 0;
    if (r.isFinalized) {
      settlement = getPeriodSettlementComponents(r).settlement;
    } else if (r.isEstimate) {
      settlement = getPeriodSettlementComponents(r, { includeEstimate: true }).settlement;
    } else {
      continue;
    }
    if (settlement > 0.005) openCompanyOwes += settlement;
    else if (settlement < -0.005) openDriverOwes += Math.abs(settlement);
  }
  const openBalance = Math.round((openCompanyOwes + openDriverOwes) * 100) / 100;

  return {
    netTakeHome: Math.round(netTakeHome * 100) / 100,
    fuelDeducted: Math.round(fuelDeducted * 100) / 100,
    openBalance,
    openCompanyOwes: Math.round(openCompanyOwes * 100) / 100,
    openDriverOwes: Math.round(openDriverOwes * 100) / 100,
    fuelLockedCount: fuelLocked.length,
    awaitingCashCount: awaitingCash.length,
    pendingCount: pending.length,
    closedCount: closed.length,
    totalPeriods: rows.length,
  };
}

/** UI labels for paycheck status. */
export function payoutStatusLabel(status: PayoutPeriodRow['status']): string {
  if (status === 'Pending') return 'Pending Fuel';
  if (status === 'Awaiting Tolls') return 'Awaiting Tolls';
  if (status === 'Awaiting Cash') return 'Cash Outstanding';
  return 'Closed';
}
