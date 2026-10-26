import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { PageShell } from './PageShell';

interface AdminDashboardProps {
  onNavigate: (page: string) => void;
}

type Score = { dataset?: string; score?: number | null; failing?: number; checked_at?: string; note?: string | null };
type Change = { id: string; dataset?: string; record_id?: string; action?: string; actor?: string | null; reason?: string | null; created_at?: string };
type Consumer = { app_key?: string; name?: string; last_sync_at?: string | null };

const DATASET_PAGE: Record<string, string> = {
  stations: 'fuel-stations',
  tolls: 'toll-stations',
  vendors: 'suppliers-prices',
  vehicles: 'motor-vehicles',
  maps: 'world-quality',
  gct_rates: 'gct-rates',
};

const DATASET_LABEL: Record<string, string> = {
  stations: 'Stations',
  tolls: 'Tolls',
  vendors: 'Vendors',
  vehicles: 'Vehicles',
  maps: 'Maps',
  gct_rates: 'GCT rates',
};

function when(iso?: string | null): string {
  if (!iso) return 'Not scored yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not scored yet';
  return date.toLocaleString();
}

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [scores, setScores] = useState<Score[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [attention, setAttention] = useState<{ id: string; label: string; count: number; page: string }[]>([]);
  const [scoredAt, setScoredAt] = useState<string | null>(null);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setFailed(false);
    const headers = { Authorization: `Bearer ${accessToken}` };
    try {
      const [qualityRes, changesRes, appsRes, statsRes, vehiclesRes, vendorsRes, placesRes] = await Promise.all([
        fetch(`${API_ENDPOINTS.catalog}/admin/quality`, { headers }),
        fetch(`${API_ENDPOINTS.catalog}/admin/changes`, { headers }),
        fetch(`${API_ENDPOINTS.catalog}/admin/consumers`, { headers }),
        fetch(`${API_ENDPOINTS.admin}/admin-stats`, { headers }),
        fetch(`${API_ENDPOINTS.admin}/admin/vehicle-catalog-pending-requests?status=open&limit=1`, { headers }),
        fetch(`${API_ENDPOINTS.admin}/admin/platform-vendors?status=pending`, { headers }),
        fetch(`${API_ENDPOINTS.explorer}/admin/coverage`, { headers }),
      ]);
      const quality = qualityRes.ok ? await qualityRes.json() : { scores: [] };
      const changeBody = changesRes.ok ? await changesRes.json() : { changes: [] };
      const apps = appsRes.ok ? await appsRes.json() : { consumers: [] };
      const stats = statsRes.ok ? await statsRes.json() : {};
      const vehicles = vehiclesRes.ok ? await vehiclesRes.json() : { total: 0 };
      const vendors = vendorsRes.ok ? await vendorsRes.json() : {};
      const places = placesRes.ok ? await placesRes.json() : { pending: 0 };

      const nextScores: Score[] = quality.scores || [];
      setScores(nextScores);
      setChanges(changeBody.changes || []);
      setConsumers(apps.consumers || []);
      const latest = nextScores
        .map((row) => row.checked_at)
        .filter((value): value is string => !!value)
        .sort()
        .at(-1) ?? null;
      setScoredAt(latest);

      const unverified = Math.max(0, Number(stats.fuelStationCount || 0) - Number(stats.stationVerified || 0));
      const vendorList = Array.isArray(vendors) ? vendors : vendors.vendors || vendors.items || [];
      const rows = [
        { id: 'vehicles', label: 'Pending vehicles', count: Number(vehicles.total || 0), page: 'pending-motor-vehicles' },
        { id: 'vendors', label: 'Pending vendors', count: Number(vendors.total ?? vendorList.length ?? 0), page: 'pending-vendor-requests' },
        { id: 'stations', label: 'Unverified stations', count: unverified, page: 'fuel-stations' },
        { id: 'places', label: 'Places to review', count: Number(places.pending || 0), page: 'plug-places' },
      ].filter((row) => row.count > 0);
      setAttention(rows);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  return (
    <PageShell
      title="Overview"
      description="Is the master data healthy, and what needs attention?"
      action={failed ? (
        <button type="button" className="text-sm font-medium text-amber-700 underline dark:text-amber-300" onClick={() => void load()}>
          Retry
        </button>
      ) : undefined}
    >
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">Needs attention</h2>
        {attention.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing is waiting.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {attention.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onNavigate(row.page)}
                className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{row.count}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{row.label}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">Health</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(scores.length ? scores : Object.keys(DATASET_LABEL).map((dataset): Score => ({ dataset, score: null, failing: 0, note: 'Not scored yet' }))).map((row) => {
            const key = row.dataset || 'dataset';
            const label = DATASET_LABEL[key] || key;
            const scoreText = typeof row.score === 'number' ? `${row.score}% pass` : (row.note || 'Not scored yet');
            return (
              <button
                key={key}
                type="button"
                onClick={() => onNavigate(DATASET_PAGE[key] || 'dashboard')}
                className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{scoreText}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {typeof row.failing === 'number' ? `${row.failing} failing` : 'Not scored yet'}
                  {row.checked_at ? ` · ${when(row.checked_at)}` : ''}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">Recent changes</h2>
        {changes.length === 0 ? (
          <p className="text-sm text-slate-500">No saves yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {changes.map((row) => (
              <li key={row.id} className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium text-slate-900 dark:text-white">{row.actor || 'Unknown'}</span>
                {' '}{row.reason || row.action || 'updated'} {row.dataset || 'a record'}
                <span className="mt-0.5 block text-xs text-slate-500">{when(row.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">Jobs</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <p>Nightly score: {when(scoredAt)}</p>
          <ul className="mt-3 space-y-1">
            {consumers.map((app) => (
              <li key={app.app_key || app.name}>
                {app.name}: {app.last_sync_at ? when(app.last_sync_at) : 'Not connected yet'}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </PageShell>
  );
}
