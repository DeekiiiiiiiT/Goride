import type { UberStatementSnapshot } from '../types/statementSnapshot';

/**
 * Minimal event shape from `GET …/ledger/canonical-events` (or append payload echo).
 */
export type CanonicalStatementSourceEvent = {
  eventType: string;
  driverId: string;
  netAmount: number;
  direction: 'inflow' | 'outflow';
  date: string;
  periodStart?: string;
  periodEnd?: string;
  metadata?: Record<string, unknown>;
};

function periodKey(e: CanonicalStatementSourceEvent): { ps: string; pe: string } {
  const ps = e.periodStart && /^\d{4}-\d{2}-\d{2}$/.test(e.periodStart) ? e.periodStart : e.date;
  const pe = e.periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(e.periodEnd) ? e.periodEnd : e.date;
  return { ps, pe };
}

function bucketKey(driverId: string, ps: string, pe: string): string {
  return `${driverId.trim().toLowerCase()}|${ps}|${pe}`;
}

/**
 * Rebuilds logical `UberStatementSnapshot` rows from canonical ledger events (Phase 4 read-side helper).
 * Use after Phase 5 money API; safe to call on client with `getCanonicalLedgerEvents` results.
 */
export function snapshotsFromCanonicalLedgerEvents(
  events: readonly CanonicalStatementSourceEvent[],
): UberStatementSnapshot[] {
  type Acc = UberStatementSnapshot & { _has?: boolean };
  const acc = new Map<string, Acc>();

  const touch = (driverId: string, ps: string, pe: string): Acc => {
    const k = bucketKey(driverId, ps, pe);
    let row = acc.get(k);
    if (!row) {
      row = { driverId: driverId.trim(), periodStart: ps, periodEnd: pe, _has: false };
      acc.set(k, row);
    }
    return row;
  };

  for (const e of events) {
    const { ps, pe } = periodKey(e);
    const row = touch(e.driverId, ps, pe);

    if (e.eventType === 'statement_line') {
      const code = typeof e.metadata?.lineCode === 'string' ? e.metadata.lineCode : '';
      const mag = Math.abs(e.netAmount);
      row._has = true;
      switch (code) {
        case 'TOTAL_EARNINGS':
          row.totalEarnings = (row.totalEarnings ?? 0) + (e.direction === 'outflow' ? -mag : mag);
          break;
        case 'NET_FARE':
          row.netFareStatement = (row.netFareStatement ?? 0) + (e.direction === 'outflow' ? -mag : mag);
          break;
        case 'PROMOTIONS':
          row.promotionsStatement = (row.promotionsStatement ?? 0) + (e.direction === 'outflow' ? -mag : mag);
          break;
        case 'TIPS':
          row.tipsStatement = (row.tipsStatement ?? 0) + (e.direction === 'outflow' ? -mag : mag);
          break;
        case 'REFUNDS_EXPENSES':
          row.refundsAndExpenses = (row.refundsAndExpenses ?? 0) + mag;
          break;
        case 'REFUNDS_TOLL':
          row.refundsToll = (row.refundsToll ?? 0) + mag;
          break;
        default:
          break;
      }
    } else if (e.eventType === 'payout_cash') {
      row._has = true;
      row.cashCollected = (row.cashCollected ?? 0) + Math.abs(e.netAmount);
    } else if (e.eventType === 'payout_bank') {
      row._has = true;
      row.bankTransferred = (row.bankTransferred ?? 0) + Math.abs(e.netAmount);
    }
  }

  return Array.from(acc.values())
    .filter((r) => r._has)
    .map(({ _has: _drop, ...rest }) => rest);
}
