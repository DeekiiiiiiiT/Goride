import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFreightCarriers, useClientFleet } from '@/app/hooks/useFreight';
import {
  useAssignLogisticsJob,
  useLogisticsJobs,
  useTransitionLogisticsJob,
} from '@/app/hooks/useLogistics';
import { useModuleAccess } from '@/app/modules/ModuleAccessProvider';

const COLUMNS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'unassigned', label: 'Unassigned', statuses: ['unassigned'] },
  { key: 'matching', label: 'Matching', statuses: ['matching'] },
  { key: 'assigned', label: 'Assigned', statuses: ['assigned'] },
  { key: 'in_progress', label: 'In progress', statuses: ['in_progress'] },
  { key: 'done', label: 'Done', statuses: ['completed', 'cancelled', 'exception'] },
];

function statusBadgeClass(status: string) {
  if (status === 'exception') return 'bg-red-100 text-red-800';
  if (status === 'completed') return 'bg-emerald-100 text-emerald-800';
  if (status === 'cancelled') return 'bg-slate-200 text-slate-600';
  if (status === 'matching') return 'bg-violet-100 text-violet-900';
  if (status === 'assigned') return 'bg-amber-100 text-amber-900';
  if (status === 'in_progress') return 'bg-sky-100 text-sky-900';
  return 'bg-slate-100 text-slate-700';
}

export function DispatchBoardPage() {
  const { modulesError, refresh } = useModuleAccess();
  const { data, isLoading, error, refetch, isFetching } = useLogisticsJobs();
  const carriers = useFreightCarriers(false);
  const clientFleet = useClientFleet();
  const assign = useAssignLogisticsJob();
  const transition = useTransitionLogisticsJob();

  const [filter, setFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assigneeType, setAssigneeType] = useState<
    'org_fleet' | 'client_fleet' | 'third_party' | 'roam_marketplace'
  >('org_fleet');
  const [carrierId, setCarrierId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const jobs = data?.jobs ?? [];
  const filtered = useMemo(() => {
    if (filter === 'all') return jobs;
    return jobs.filter((j) => String(j.status) === filter);
  }, [jobs, filter]);

  const byColumn = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    for (const col of COLUMNS) {
      map[col.key] = filtered.filter((j) => col.statuses.includes(String(j.status)));
    }
    return map;
  }, [filtered]);

  const selected = jobs.find((j) => String(j.id) === selectedId) ?? null;

  async function onAssign() {
    if (!selected) return;
    setActionError(null);
    try {
      await assign.mutateAsync({
        id: String(selected.id),
        assigneeType,
        thirdPartyCarrierId: assigneeType === 'third_party' ? carrierId || null : null,
        clientFleetAssetId: assigneeType === 'client_fleet' ? assetId || null : null,
      });
      setSelectedId(null);
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  async function onStart() {
    if (!selected) return;
    setActionError(null);
    try {
      await transition.mutateAsync({ id: String(selected.id), status: 'in_progress' });
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  async function onComplete() {
    if (!selected) return;
    setActionError(null);
    try {
      await transition.mutateAsync({ id: String(selected.id), status: 'completed' });
      setSelectedId(null);
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  async function onUnassign() {
    if (!selected) return;
    setActionError(null);
    try {
      await transition.mutateAsync({ id: String(selected.id), status: 'unassigned' });
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dispatch Board</h1>
          <p className="mt-1 text-sm text-slate-500">
            Domestic freight jobs — assign org fleet, client fleet, or 3PL.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {modulesError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{modulesError}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="font-semibold underline-offset-2 hover:underline"
          >
            Retry modules
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(['all', 'unassigned', 'matching', 'assigned', 'in_progress', 'completed', 'exception', 'cancelled'] as const).map(
          (f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                filter === f
                  ? 'bg-amber-100 text-amber-900'
                  : 'border border-slate-200 bg-white text-slate-600'
              }`}
            >
              {f === 'all' ? 'All' : f.replace(/_/g, ' ')}
            </button>
          ),
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading jobs…</p>}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && jobs.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium">No dispatch jobs yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Book a domestic shipment and it will appear here as unassigned.
          </p>
          <Link
            to="/app/shipments/new"
            className="mt-4 inline-block rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            New shipment
          </Link>
        </div>
      )}

        {jobs.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-5">
          {COLUMNS.map((col) => (
            <section
              key={col.key}
              className="min-h-[12rem] rounded-xl border border-slate-200 bg-slate-50/80"
            >
              <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {col.label}
                </h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                  {byColumn[col.key]?.length ?? 0}
                </span>
              </header>
              <ul className="space-y-2 p-2">
                {(byColumn[col.key] ?? []).map((job) => (
                  <li key={String(job.id)}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(String(job.id));
                        setActionError(null);
                        setAssigneeType('org_fleet');
                        setCarrierId('');
                        setAssetId('');
                      }}
                      className={`w-full rounded-lg border bg-white px-3 py-2.5 text-left text-sm shadow-sm transition hover:border-amber-300 ${
                        selectedId === String(job.id)
                          ? 'border-amber-400 ring-1 ring-amber-200'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="font-medium text-slate-900">
                        {String(job.reference_code || job.id).slice(0, 24)}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                        {String(job.pickup_label || '—')} → {String(job.dropoff_label || '—')}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(
                            String(job.status),
                          )}`}
                        >
                          {String(job.status).replace(/_/g, ' ')}
                        </span>
                        {job.assignee_type ? (
                          <span className="text-[10px] text-slate-500">
                            {String(job.assignee_type).replace(/_/g, ' ')}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
                {(byColumn[col.key] ?? []).length === 0 && (
                  <li className="px-2 py-6 text-center text-xs text-slate-400">Empty</li>
                )}
              </ul>
            </section>
          ))}
        </div>
      )}

      {selected && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">
                {String(selected.reference_code || selected.id)}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {String(selected.pickup_label)} → {String(selected.dropoff_label)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Status: {String(selected.status).replace(/_/g, ' ')}
                {selected.assignee_type
                  ? ` · ${String(selected.assignee_type).replace(/_/g, ' ')}`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.external_ref_type === 'freight_shipment' && selected.external_ref_id ? (
                <Link
                  to={`/app/shipments/${String(selected.external_ref_id)}`}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open shipment
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
              >
                Close
              </button>
            </div>
          </div>

          {(selected.status === 'unassigned' ||
            selected.status === 'assigned' ||
            selected.status === 'matching') && (
            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
              {selected.status === 'matching' ? (
                <div className="sm:col-span-2 space-y-2">
                  <p className="text-sm text-slate-600">
                    Offering this job to online org drivers. Wave{' '}
                    {String(selected.matching_wave ?? 0)}.
                  </p>
                  <button
                    type="button"
                    disabled={transition.isPending}
                    onClick={() => void onUnassign()}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
                  >
                    Cancel matching
                  </button>
                </div>
              ) : (
                <>
              <label className="block text-sm">
                Assignee type
                <select
                  value={assigneeType}
                  onChange={(e) =>
                    setAssigneeType(
                      e.target.value as
                        | 'org_fleet'
                        | 'client_fleet'
                        | 'third_party'
                        | 'roam_marketplace',
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="org_fleet">Org fleet (manual)</option>
                  <option value="roam_marketplace">Auto-dispatch (org drivers)</option>
                  <option value="client_fleet">Client fleet</option>
                  <option value="third_party">3PL</option>
                </select>
              </label>
              {assigneeType === 'third_party' && (
                <label className="block text-sm">
                  Carrier
                  <select
                    value={carrierId}
                    onChange={(e) => setCarrierId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">Select…</option>
                    {(carriers.data?.carriers ?? []).map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>
                        {String(c.name)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {assigneeType === 'client_fleet' && (
                <label className="block text-sm">
                  Client driver
                  <select
                    value={assetId}
                    onChange={(e) => setAssetId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">Select…</option>
                    {(clientFleet.data?.assets ?? []).map((a) => (
                      <option key={String(a.id)} value={String(a.id)}>
                        {String(a.driver_name)} ({String(a.vehicle_plate || '—')})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                <button
                  type="button"
                  disabled={assign.isPending}
                  onClick={() => void onAssign()}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
                >
                  {assign.isPending ? 'Assigning…' : 'Assign'}
                </button>
                {selected.status === 'assigned' && (
                  <>
                    <button
                      type="button"
                      disabled={transition.isPending}
                      onClick={() => void onStart()}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
                    >
                      Mark in progress
                    </button>
                    <button
                      type="button"
                      disabled={transition.isPending}
                      onClick={() => void onUnassign()}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
                    >
                      Unassign
                    </button>
                  </>
                )}
              </div>
                </>
              )}
            </div>
          )}

          {selected.status === 'in_progress' && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={transition.isPending}
                onClick={() => void onComplete()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                Mark completed
              </button>
            </div>
          )}

          {actionError && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {actionError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
