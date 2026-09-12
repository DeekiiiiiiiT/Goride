import React, { useState } from 'react';
import { useLedgerQuery } from '../../hooks/useLedgerQuery';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { requireAuthHeaders } from '../../utils/authHeaders';
import { fetchWithRetry } from '../../services/api';
import { useLedgerPeriod } from '../../contexts/LedgerPeriodContext';

type EntryTypeFilter = 'all' | 'trip' | 'fuel' | 'toll';

const ENTRY_TYPE_CHIPS: { id: EntryTypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'trip', label: 'Trip' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'toll', label: 'Toll' },
];

/** Unified fleet.ledger_entries table (client flag: roam_ledger_read_model=1). */
export function UnifiedLedgerAllTab() {
  const { period } = useLedgerPeriod();
  const [entryType, setEntryType] = useState<EntryTypeFilter>('all');

  const filters = {
    startDate: period.startDate,
    endDate: period.endDate,
    limit: 50,
    entryType: entryType === 'all' ? undefined : entryType,
  };
  const q = useLedgerQuery<{ entries: any[]; next_cursor: string | null; disabled?: boolean }>({
    domain: 'unified-all',
    filters,
    queryFn: async (f) => {
      const body: Record<string, unknown> = {
        startDate: f.startDate,
        endDate: f.endDate,
        limit: f.limit ?? 50,
      };
      if (f.entryType) body.entryType = f.entryType;
      const res = await fetchWithRetry(`${API_ENDPOINTS.financial}/ledger/search`, {
        method: 'POST',
        headers: await requireAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 404) {
        return { entries: [], next_cursor: null, disabled: true };
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Unified ledger search failed');
      }
      return { ...(await res.json()), disabled: false };
    },
  });

  if (q.isLoading && !q.data) {
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
  const typeLabel = entryType === 'all' ? 'All entry types' : `${entryType} entries`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Unified ledger — {typeLabel} for {period.startDate || '…'} → {period.endDate || '…'} (
          {entries.length} rows this page).
        </p>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Entry type filter">
          {ENTRY_TYPE_CHIPS.map((chip) => {
            const active = entryType === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setEntryType(chip.id)}
                className={`min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Period</th>
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
                <td className="px-3 py-2 font-mono text-xs">{e.period_key || '—'}</td>
                <td className="px-3 py-2">{e.source_system}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.amount_gross ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.amount_net ?? '—'}</td>
                <td className="px-3 py-2">{e.status || '—'}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
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
