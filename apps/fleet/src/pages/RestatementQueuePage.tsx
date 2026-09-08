/**
 * Pass E / Pass 5: draft week-statement restatements awaiting Close Week sign-off.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { cn } from '../components/ui/utils';
import { requireAuthHeaders } from '../utils/authHeaders';
import { fetchWithRetry } from '../services/api';
import { API_ENDPOINTS } from '../services/apiConfig';

export type RestatementRow = {
  id?: string;
  driverId: string;
  driverName?: string;
  weekKey: string;
  kind: string;
  version: number;
  status: string;
  reason?: string | null;
  createdAt?: string;
};

/** Shared with Driver Settlements hub badge — one React Query cache. */
export const RESTATEMENT_QUEUE_QUERY_KEY = ['week-statement-restatements'] as const;

export async function listWeekStatementRestatements(): Promise<RestatementRow[]> {
  const response = await fetchWithRetry(
    `${API_ENDPOINTS.financial}/settlements/week-close/restatements?pageSize=100`,
    { headers: await requireAuthHeaders(null) },
  );
  if (!response.ok) {
    throw new Error(`Failed to load restatements (${response.status})`);
  }
  const json = (await response.json()) as { rows?: RestatementRow[] };
  return json.rows || [];
}

function weekLabel(weekKey: string): string {
  try {
    const start = parseISO(`${weekKey}T12:00:00`);
    const end = addDays(start, 6);
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  } catch {
    return weekKey;
  }
}

function StatusChip({ status }: { status: string }) {
  const s = String(status || 'draft').toLowerCase();
  const chrome =
    s === 'draft'
      ? 'bg-amber-50 text-amber-900 border-amber-200'
      : s === 'closed'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${chrome}`}>
      {s}
    </span>
  );
}

export function RestatementQueuePage({
  onNavigate,
  embedded = false,
}: {
  onNavigate: (page: string, opts?: { weekKey?: string }) => void;
  /** When true, omit page H1 / outer padding — Driver Settlements hub owns chrome. */
  embedded?: boolean;
}) {
  const q = useQuery({
    queryKey: RESTATEMENT_QUEUE_QUERY_KEY,
    queryFn: listWeekStatementRestatements,
  });

  return (
    <div className={cn(embedded ? 'space-y-4' : 'mx-auto max-w-5xl space-y-4 p-4 sm:p-6')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {!embedded ? (
            <h1 className="text-xl font-semibold text-slate-900">Restatement queue</h1>
          ) : null}
          <p className={cn('text-sm text-slate-500', !embedded && 'mt-1')}>
            Draft statement revisions after a week was closed. Sign them on Close Week — never approve outside that flow.
            Open Close Week for that week and use <strong>Sign restatements</strong> (week stays frozen). Use{' '}
            <strong>Re-open week</strong> only when you need to unlock Fuel/Tolls/Settlement edits.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
        >
          {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {q.isLoading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading restatements…
        </div>
      ) : q.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {(q.error as Error)?.message || 'Failed to load restatements'}
        </div>
      ) : (q.data || []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-500">
          <p className="font-medium text-slate-700">No pending restatements</p>
          <p className="mt-1">
            Rows appear here when a late import or correction lands on a week that was already Closed.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Driver</th>
                <th className="px-3 py-2">Week</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(q.data || []).map((row) => (
                <tr key={row.id || `${row.driverId}|${row.weekKey}|${row.kind}|${row.version}`}>
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {row.driverName || row.driverId}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    <div>{weekLabel(row.weekKey)}</div>
                    <div className="text-[11px] text-slate-400">{row.weekKey}</div>
                  </td>
                  <td className="px-3 py-2 capitalize text-slate-700">{row.kind}</td>
                  <td className="px-3 py-2">
                    <StatusChip status={row.status} />
                    <div className="mt-0.5 text-[11px] text-slate-400">v{row.version}</div>
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-slate-500" title={row.reason || ''}>
                    {row.reason || '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigate('close-week', { weekKey: row.weekKey })}
                    >
                      Open Close Week
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
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
