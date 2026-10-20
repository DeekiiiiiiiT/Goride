/**
 * Read-only per-driver settlement amounts (Close Week confirm pattern) — R2-26.
 */
import React, { useMemo } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { MONEY_EPS } from '@roam/finance-core';
import type { ReconRunPayload } from '../../../services/reconApi';
import { useSettlementQueue } from '../../../hooks/useSettlementQueue';
import { resolvePayQueueOwed } from '../../../utils/driverSettlementsPayAmount';
import { computeSettlementLaneMetrics } from '../../../utils/settlementLaneMetrics';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

function collectOwedMajor(r: {
  amountOwed?: number | null;
  collectKind?: string | null;
  cashStillHeld?: number | null;
  settlementAmount?: number | null;
}): number {
  if (r.amountOwed != null && Number.isFinite(r.amountOwed)) return Math.max(0, Number(r.amountOwed));
  if (r.collectKind === 'cash_held') return Math.max(0, Number(r.cashStillHeld) || 0);
  return Math.max(0, Math.abs(Number(r.settlementAmount) || 0));
}

export function ReconSettlementStep({ run }: { run: ReconRunPayload }) {
  const weekKey = run.run.weekKey;
  const periodEnd = useMemo(
    () => format(addDays(parseISO(`${weekKey}T12:00:00`), 6), 'yyyy-MM-dd'),
    [weekKey],
  );

  const queueParams = {
    weekFrom: weekKey,
    weekTo: periodEnd,
    minAmount: 0,
    pageSize: 200,
    groupBy: 'week' as const,
  };
  const collectQuery = useSettlementQueue({ view: 'collect', ...queueParams });
  const payQuery = useSettlementQueue({ view: 'pay', ...queueParams });

  const settlement = useMemo(() => {
    return computeSettlementLaneMetrics(
      collectQuery.data?.rows || [],
      payQuery.data?.rows || [],
    );
  }, [collectQuery.data?.rows, payQuery.data?.rows]);

  const drivers = useMemo(() => {
    type Row = {
      driverId: string;
      driverName?: string;
      amountOwed?: number | null;
      collectKind?: string | null;
      cashStillHeld?: number | null;
      settlementAmount?: number | null;
    };
    const byId = new Map<
      string,
      { driverId: string; name: string; owed: number; fleet: number }
    >();
    for (const r of (collectQuery.data?.rows || []) as Row[]) {
      const id = String(r.driverId || '').trim();
      if (!id) continue;
      const cur = byId.get(id) || {
        driverId: id,
        name: String(r.driverName || id),
        owed: 0,
        fleet: 0,
      };
      if (r.driverName) cur.name = String(r.driverName);
      cur.owed += collectOwedMajor(r);
      byId.set(id, cur);
    }
    for (const r of (payQuery.data?.rows || []) as Row[]) {
      const id = String(r.driverId || '').trim();
      if (!id) continue;
      const cur = byId.get(id) || {
        driverId: id,
        name: String(r.driverName || id),
        owed: 0,
        fleet: 0,
      };
      if (r.driverName) cur.name = String(r.driverName);
      cur.fleet += resolvePayQueueOwed(r);
      byId.set(id, cur);
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }, [collectQuery.data?.rows, payQuery.data?.rows]);

  const loading = collectQuery.isLoading || payQuery.isLoading;

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading settlement amounts…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Read-only Collect / Pay residuals for week of {weekKey}. Finish cash movement on Cash desk if
        anything remains open; closing happens on the next step.
      </p>

      <dl className="grid gap-2 sm:grid-cols-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Fleet owes</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{MONEY(settlement.fleetOwes)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Drivers owe</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{MONEY(settlement.driversOwe)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Cash held</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{MONEY(settlement.cashHeld)}</dd>
        </div>
      </dl>

      {drivers.length === 0 ? (
        <p className="text-sm text-slate-500">No driver Collect / Pay rows for this week.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Driver</th>
                <th className="px-3 py-2 font-medium tabular-nums">Driver owes</th>
                <th className="px-3 py-2 font-medium tabular-nums">Fleet owes</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.driverId} className="border-t border-slate-100 text-slate-800">
                  <td className="px-3 py-2 font-medium">{d.name}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {d.owed > MONEY_EPS ? MONEY(d.owed) : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {d.fleet > MONEY_EPS ? MONEY(d.fleet) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
