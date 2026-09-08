/**
 * Done-tab cash history: union of settlement_movements + Log Cash (Cash Collection)
 * / Driver Payout txs. Root cause of "invisible cash": Done preferred movements whenever
 * any row existed and never fell through to Cash Collection txs.
 */
import { periodEndForAnchor } from '@roam/finance-core';

export type DoneHistoryMovement = {
  id: string;
  kind: string;
  driverId: string;
  driverName?: string;
  amount: number;
  method?: string;
  status?: string;
  date?: string;
  periodAnchor: string;
  periodEnd?: string;
  reference?: string;
  description?: string;
  approvalState?: string;
  sourceTransactionId?: string;
};

export type DoneHistoryTx = {
  id?: string;
  driverId?: string;
  driverName?: string;
  amount?: number;
  paymentMethod?: string;
  status?: string;
  date?: string;
  description?: string;
  referenceNumber?: string;
  metadata?: { workPeriodStart?: string; workPeriodEnd?: string };
};

function ymd(v: unknown): string {
  return String(v || '').slice(0, 10);
}

function txWeek(t: DoneHistoryTx): string {
  return ymd(t.metadata?.workPeriodStart || t.date);
}

/**
 * Merge posted settlement movements with cleared Log Cash / payout txs.
 * Dedupes when a movement already points at the same source transaction id,
 * or when a movement id equals the tx id (legacy).
 */
export function mergeDoneCashHistory(opts: {
  direction: 'collect' | 'pay';
  movements: DoneHistoryMovement[];
  legacyTxs: DoneHistoryTx[];
  weekFrom: string;
  weekTo: string;
  search?: string;
  isClearedTx: (t: DoneHistoryTx) => boolean;
}): DoneHistoryMovement[] {
  const q = String(opts.search || '').trim().toLowerCase();
  const from = ymd(opts.weekFrom);
  const to = ymd(opts.weekTo);

  const movementKindOk = (kind: string) => {
    const k = String(kind || '').toLowerCase();
    if (opts.direction === 'pay') return k === 'pay' || k === 'reverse';
    return k === 'collect' || k === 'write_off' || k === 'reverse';
  };

  const fromMovements = (opts.movements || []).filter((m) => {
    const st = String(m.status || '').toLowerCase();
    const ap = String(m.approvalState || '').toLowerCase();
    if (st === 'void' || st === 'pending') return false;
    if (ap === 'pending' || ap === 'rejected') return false;
    if (!movementKindOk(m.kind)) return false;
    const week = ymd(m.periodAnchor);
    if (from && week && (week < from || week > to)) return false;
    if (!q) return true;
    return (
      String(m.driverName || '').toLowerCase().includes(q) ||
      String(m.driverId || '').toLowerCase().includes(q) ||
      week.includes(q)
    );
  });

  const coveredTxIds = new Set<string>();
  for (const m of fromMovements) {
    const src = String(m.sourceTransactionId || '').trim();
    if (src) coveredTxIds.add(src);
    const id = String(m.id || '').trim();
    if (id) coveredTxIds.add(id);
  }

  const fromTxs: DoneHistoryMovement[] = [];
  for (const t of opts.legacyTxs || []) {
    if (!opts.isClearedTx(t)) continue;
    const txId = String(t.id || '').trim();
    if (txId && coveredTxIds.has(txId)) continue;
    const week = txWeek(t);
    if (week && from && to && (week < from || week > to)) continue;
    if (!week) {
      const d = ymd(t.date);
      if (from && to && (d < from || d > to)) continue;
    }
    if (q) {
      const hit =
        String(t.driverName || '').toLowerCase().includes(q) ||
        String(t.driverId || '').toLowerCase().includes(q) ||
        week.includes(q);
      if (!hit) continue;
    }
    fromTxs.push({
      id: txId || `tx:${week}:${t.driverId}:${t.amount}`,
      kind: opts.direction === 'pay' ? 'pay' : 'collect',
      driverId: String(t.driverId || ''),
      driverName: t.driverName,
      amount: Math.abs(Number(t.amount) || 0),
      method: t.paymentMethod,
      status: t.status || 'Completed',
      date: ymd(t.date),
      periodAnchor: week || ymd(t.date),
      periodEnd: (() => {
        const start = week || ymd(t.date);
        const stored = ymd(t.metadata?.workPeriodEnd);
        return stored && stored !== start ? stored : periodEndForAnchor(start);
      })(),
      reference: t.referenceNumber,
      description: t.description,
      sourceTransactionId: txId,
    });
  }

  return [...fromMovements, ...fromTxs].sort((a, b) => {
    const week = ymd(b.periodAnchor).localeCompare(ymd(a.periodAnchor));
    if (week !== 0) return week;
    return String(b.date || '').localeCompare(String(a.date || ''));
  });
}
