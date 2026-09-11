import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { requireAuthHeaders } from '../../utils/authHeaders';
import { fetchWithRetry } from '../../services/api';
import { useLedgerPeriod } from '../../contexts/LedgerPeriodContext';

/** Preview table for unified fleet.ledger_entries (flag: roam_ledger_read_model=1). */
export function UnifiedLedgerAllTab() {
  const { period } = useLedgerPeriod();
  const q = useQuery({
    queryKey: ['unifiedLedger', period],
    queryFn: async () => {
      const res = await fetchWithRetry(`${API_ENDPOINTS.financial}/ledger/search`, {
        method: 'POST',
        headers: await requireAuthHeaders(),
        body: JSON.stringify({
          startDate: period.startDate,
          endDate: period.endDate,
          limit: 50,
        }),
      });
      if (res.status === 404) {
        return { entries: [], next_cursor: null, disabled: true as const };
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Unified ledger search failed');
      }
      return { ...(await res.json()), disabled: false as const };
    },
  });

  if (q.isLoading) {
    return <p className="text-sm text-slate-500">Loading unified ledger…</p>;
  }
  if (q.error) {
    return <p className="text-sm text-red-600">{(q.error as Error).message}</p>;
  }
  if (q.data?.disabled) {
    return (
      <p className="text-sm text-slate-500">
        Unified read model is off on the server. Apply migration, set feature flag{' '}
        <code>ledger_read_model</code> or env <code>LEDGER_READ_MODEL=1</code>, then refresh.
      </p>
    );
  }

  const entries = q.data?.entries || [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        All entry types for {period.startDate} → {period.endDate} ({entries.length} rows this page).
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-right">Gross</th>
              <th className="px-3 py-2 text-right">Net</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e: any) => (
              <tr key={e.entry_id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">{e.entry_type}</td>
                <td className="px-3 py-2">{String(e.occurred_at || '').slice(0, 10)}</td>
                <td className="px-3 py-2">{e.source_system}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.amount_gross ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.amount_net ?? '—'}</td>
                <td className="px-3 py-2">{e.status || '—'}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  No unified ledger rows in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
