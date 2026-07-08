import type { TollUiState } from '@roam/types/tollCrossings';
import React from 'react';

export interface LiveTollTripRow {
  rideId: string;
  status: string;
  lastGpsAgeSec: number | null;
  tollCount: number;
  tollTotalMinor: number;
  lastPlazaName: string | null;
  flagged?: boolean;
}

export interface AdminLiveTollMonitorProps {
  trips: LiveTollTripRow[];
  filter: 'all' | 'has_tolls' | 'no_tolls';
  onFilterChange: (f: 'all' | 'has_tolls' | 'no_tolls') => void;
  onSelectTrip: (rideId: string) => void;
  state?: TollUiState;
  currency?: string;
}

function formatMinor(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function AdminLiveTollMonitor({
  trips,
  filter,
  onFilterChange,
  onSelectTrip,
  state = 'data',
  currency = 'JMD',
}: AdminLiveTollMonitorProps) {
  const filtered = trips.filter((t) => {
    if (filter === 'has_tolls') return t.tollCount > 0;
    if (filter === 'no_tolls') return t.tollCount === 0;
    return true;
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Live toll monitor</h2>
        <select
          value={filter}
          onChange={(e) => onFilterChange(e.target.value as typeof filter)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="all">All trips</option>
          <option value="has_tolls">Has tolls</option>
          <option value="no_tolls">No tolls</option>
        </select>
      </div>
      {state === 'loading' && <p className="p-8 text-center text-slate-500">Loading active trips…</p>}
      {state === 'empty' && <p className="p-8 text-center text-slate-500">No active trips.</p>}
      {state === 'data' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500 dark:border-slate-800">
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Last GPS</th>
                <th className="px-4 py-2 font-medium">Tolls</th>
                <th className="px-4 py-2 font-medium">Last plaza</th>
                <th className="px-4 py-2 font-medium">Flag</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.rideId}
                  className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer dark:border-slate-800 dark:hover:bg-slate-800/50"
                  onClick={() => onSelectTrip(t.rideId)}
                >
                  <td className="px-4 py-3 capitalize">{t.status.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {t.lastGpsAgeSec != null ? `${t.lastGpsAgeSec}s ago` : '—'}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {t.tollCount > 0
                      ? `${t.tollCount} · ${formatMinor(t.tollTotalMinor, currency)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">{t.lastPlazaName ?? '—'}</td>
                  <td className="px-4 py-3">{t.flagged ? '⚠' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
