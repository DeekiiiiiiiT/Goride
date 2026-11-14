/**
 * Roam ops — org-weeks waiting on Roam-issued fuel statements (recon P6).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { roamFuelExternalCopy } from '../../../finance-core/src/reconExternalRoam';
import { fleetCustomerOpsApi } from '../services/fleetCustomerOpsApi';

export type ReconExternalQueueItem = {
  organizationId: string;
  organizationName: string | null;
  serviceLine: string;
  weekKey: string;
  sourceId: string;
  runId: string | null;
  runSourceStatus: string | null;
  requestId: string | null;
  requestedAt: string | null;
  requestedBy: string | null;
  note: string | null;
};

export async function fetchReconExternalQueue(): Promise<ReconExternalQueueItem[] | null> {
  return fleetCustomerOpsApi.fetchReconExternalQueue();
}

export function ReconExternalQueuePanel({ onOpenImport }: { onOpenImport?: () => void } = {}) {
  const [items, setItems] = useState<ReconExternalQueueItem[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const rows = await fetchReconExternalQueue();
      if (rows === null) {
        setForbidden(true);
        setItems([]);
      } else {
        setItems(rows);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading waiting-on-Roam queue…
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        You don&apos;t have access to the cross-org reconciliation queue. Platform staff or{' '}
        <code className="text-xs">recon.external_sources</code> permission is required.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {error}
        <button type="button" className="ml-3 underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Fleets waiting on Roam&apos;s JAA statement for a week. Upload it once in Statement import —
          every fleet with a Roam card is then marked received for that week.
        </p>
        <div className="flex items-center gap-2">
          {onOpenImport ? (
            <button
              type="button"
              onClick={onOpenImport}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Open Statement import
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {!items?.length ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-6 text-sm text-emerald-900">
          No org-weeks are waiting on Roam right now.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Fleet</th>
                <th className="px-3 py-2">Week</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last remind</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((row) => {
                const copy = roamFuelExternalCopy(row.weekKey);
                const key = `${row.organizationId}-${row.weekKey}-${row.sourceId}`;
                return (
                  <tr key={key} className="bg-white">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {row.organizationName || row.organizationId}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.weekKey}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          copy.isOverdue
                            ? 'inline-flex items-center gap-1 text-amber-800'
                            : 'text-slate-700'
                        }
                      >
                        {copy.isOverdue ? <AlertCircle className="h-3.5 w-3.5" /> : null}
                        {copy.statusLine}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {row.requestedAt
                        ? `${row.requestedBy ?? 'fleet'} · ${new Date(row.requestedAt).toLocaleString()}`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
