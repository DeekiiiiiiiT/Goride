import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { FuelEntry } from '../../../types/fuel';

type Mode = 'reconciliation' | 'logs';

/**
 * Dominion read-only money surfaces (Phase 5).
 * Write/approve/finalize stay in RoamFleet until fuel-core parity is proven in prod.
 */
export function FuelMoneyReadOnlyPage({
  mode,
  logs,
  loading,
}: {
  mode: Mode;
  logs: FuelEntry[];
  loading: boolean;
}) {
  const summary = useMemo(() => {
    const entries = logs || [];
    let spend = 0;
    let liters = 0;
    let pending = 0;
    let verified = 0;
    for (const e of entries) {
      spend += Number(e.amount) || 0;
      liters += Number(e.liters) || 0;
      if (e.reconciliationStatus === 'Pending') pending += 1;
      if (e.reconciliationStatus === 'Verified' || e.reconciliationStatus === 'Archived') verified += 1;
    }
    return { count: entries.length, spend, liters, pending, verified };
  }, [logs]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        <p className="text-sm text-slate-500">Loading fuel money overview…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {mode === 'reconciliation' ? 'Fuel Reconciliation (read-only)' : 'Fuel Transaction Logs (read-only)'}
        </h1>
        <p className="mt-1 text-sm text-slate-500 max-w-2xl">
          Platform view of fleet fuel money. Approvals and finalize remain in RoamFleet so there is
          only one write path.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Entries" value={String(summary.count)} />
        <Stat label="Spend (JMD)" value={summary.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
        <Stat label="Litres" value={summary.liters.toFixed(0)} />
        <Stat
          label={mode === 'reconciliation' ? 'Pending / Verified' : 'Pending'}
          value={
            mode === 'reconciliation'
              ? `${summary.pending} / ${summary.verified}`
              : String(summary.pending)
          }
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-medium">
          Recent entries
        </div>
        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-left text-xs uppercase text-slate-500 sticky top-0">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Vendor</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Litres</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(logs || []).slice(0, 100).map((e) => (
                <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 tabular-nums">{String(e.date || '').split('T')[0]}</td>
                  <td className="px-4 py-2">{e.vendor || e.location || '—'}</td>
                  <td className="px-4 py-2 tabular-nums">{Number(e.amount || 0).toLocaleString()}</td>
                  <td className="px-4 py-2 tabular-nums">{Number(e.liters || 0).toFixed(1)}</td>
                  <td className="px-4 py-2">{e.reconciliationStatus || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
