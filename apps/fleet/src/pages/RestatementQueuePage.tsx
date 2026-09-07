/**
 * Pass E: draft week-statement restatements awaiting Close Week sign-off.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { requireAuthHeaders } from '../utils/authHeaders';
import { fetchWithRetry } from '../services/api';
import { API_ENDPOINTS } from '../services/apiConfig';

type RestatementRow = {
  id?: string;
  driverId: string;
  weekKey: string;
  kind: string;
  version: number;
  status: string;
  reason?: string | null;
  createdAt?: string;
};

async function listRestatements(): Promise<RestatementRow[]> {
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

export function RestatementQueuePage({
  onNavigate,
}: {
  onNavigate: (page: string, opts?: { weekKey?: string }) => void;
}) {
  const q = useQuery({
    queryKey: ['week-statement-restatements'],
    queryFn: listRestatements,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Restatement queue</h1>
          <p className="mt-1 text-sm text-slate-500">
            Draft statement revisions waiting to be signed on Close Week.
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
          No pending restatements.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Driver</th>
                <th className="px-3 py-2">Week</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2 text-right">Approve</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(q.data || []).map((row) => (
                <tr key={row.id || `${row.driverId}|${row.weekKey}|${row.kind}|${row.version}`}>
                  <td className="px-3 py-2 font-medium text-slate-800">{row.driverId}</td>
                  <td className="px-3 py-2 text-slate-700">{row.weekKey}</td>
                  <td className="px-3 py-2 capitalize text-slate-700">{row.kind}</td>
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
                      Close Week
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

