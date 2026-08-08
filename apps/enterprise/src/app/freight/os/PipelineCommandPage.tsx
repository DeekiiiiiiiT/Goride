import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/auth/AuthProvider';
import { freightService } from '@/app/services/freightService';
import { LANE_TILES, PIPELINE_FUNNEL, RECENT_EXCEPTIONS } from './mockData';

const FUNNEL_KEYS = PIPELINE_FUNNEL.map((t) => t.key);

/** Pipeline Command — live funnel when API available, Stitch layout retained. */
export function PipelineCommandPage() {
  const { organizationId, session } = useAuth();
  const q = useQuery({
    queryKey: ['freight', 'pipeline-command', organizationId],
    queryFn: () => freightService.pipelineCommand(organizationId),
    enabled: Boolean(session),
  });

  const counts = q.data?.counts ?? {};
  const dutyJmd = q.data?.dutyOutstandingJmdMinor;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pipeline Command</h1>
          <p className="mt-1 text-sm text-slate-500">
            Jamaica intl mailbox funnel · glanceable ops overview
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/packages"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
          >
            Packages
          </Link>
          <Link
            to="/app/manifests"
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            New Manifest
          </Link>
        </div>
      </div>

      {q.isLoading && <p className="text-sm text-slate-500">Loading pipeline…</p>}
      {q.error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Live counts unavailable — showing layout shell. {(q.error as Error).message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {PIPELINE_FUNNEL.map((tile) => (
          <div
            key={tile.key}
            className={`rounded-xl border px-4 py-3 ${
              tile.key === 'exception'
                ? 'border-red-200 bg-red-50'
                : 'border-slate-200 bg-white'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {tile.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {FUNNEL_KEYS.includes(tile.key)
                ? (counts[tile.key] ?? (q.data ? 0 : tile.count))
                : tile.count}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LANE_TILES.map((lane) => (
          <div
            key={lane.id}
            className={`rounded-xl border px-4 py-3 ${
              lane.tone === 'green'
                ? 'border-green-200 bg-green-50'
                : lane.tone === 'amber'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-red-200 bg-red-50'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
              {lane.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {q.data
                ? lane.id === 'green'
                  ? (counts.customs_cleared ?? 0)
                  : lane.id === 'yellow' || lane.id === 'red'
                    ? (counts.customs_hold ?? 0)
                    : 0
                : lane.count}
            </p>
          </div>
        ))}
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Duty outstanding
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {dutyJmd != null
              ? `J$${(dutyJmd / 100).toLocaleString()}`
              : 'J$—'}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Exceptions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Tracking</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Count hint</th>
              </tr>
            </thead>
            <tbody>
              {(counts.exception ?? 0) === 0 && q.data ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">
                    No packages in exception
                  </td>
                </tr>
              ) : (
                <tr className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-mono text-xs">—</td>
                  <td className="px-4 py-2.5">exception</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {counts.exception ?? (q.data ? 0 : RECENT_EXCEPTIONS.length)} open
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
