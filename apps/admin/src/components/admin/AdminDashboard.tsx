// Stitch: dominion-redesign/282dc999dca64dcfbb7050e1bf24254b
import React, { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { DominionError, DominionLoading } from './DominionStates';

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
  places: 'plug-places',
  gct_rates: 'gct-rates',
};

const DATASET_LABEL: Record<string, string> = {
  stations: 'Stations',
  tolls: 'Toll plazas',
  vendors: 'Vendors',
  vehicles: 'Vehicles',
  maps: 'Places',
  places: 'Places',
  gct_rates: 'GCT rates',
};

const QUALITY_ORDER = ['stations', 'tolls', 'vendors', 'maps', 'vehicles'];

function when(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [qualityFailed, setQualityFailed] = useState(false);
  const [changesFailed, setChangesFailed] = useState(false);
  const [appsFailed, setAppsFailed] = useState(false);
  const [stationsFailed, setStationsFailed] = useState(false);
  const [stationLine, setStationLine] = useState<string | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [placesWaiting, setPlacesWaiting] = useState<number | null>(null);
  const [vehiclesWaiting, setVehiclesWaiting] = useState<number | null>(null);
  const [vendorsWaiting, setVendorsWaiting] = useState<number | null>(null);
  const [scoredAt, setScoredAt] = useState<string | null>(null);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setFailed(false);
    setQualityFailed(false);
    setChangesFailed(false);
    setAppsFailed(false);
    setStationsFailed(false);
    const headers = { Authorization: `Bearer ${accessToken}` };
    try {
      const [qualityRes, changesRes, appsRes, statsRes, vehiclesRes, vendorsRes, placesRes] = await Promise.all([
        fetch(`${API_ENDPOINTS.catalog}/admin/quality`, { headers }),
        fetch(`${API_ENDPOINTS.catalog}/admin/changes`, { headers }),
        fetch(`${API_ENDPOINTS.catalog}/admin/consumers`, { headers }),
        fetch(`${API_ENDPOINTS.admin}/admin-stats`, { headers }),
        fetch(`${API_ENDPOINTS.admin}/admin/vehicle-catalog-pending-requests?status=open&limit=1`, { headers }),
        fetch(`${API_ENDPOINTS.catalog}/admin/vendors?status=pending`, { headers }),
        fetch(`${API_ENDPOINTS.explorer}/admin/coverage`, { headers }),
      ]);
      const qualityOk = qualityRes.ok;
      const changesOk = changesRes.ok;
      const appsOk = appsRes.ok;
      const statsOk = statsRes.ok;
      setQualityFailed(!qualityOk);
      setChangesFailed(!changesOk);
      setAppsFailed(!appsOk);
      const quality = qualityOk ? await qualityRes.json() : { scores: [] };
      const changeBody = changesOk ? await changesRes.json() : { changes: [] };
      const apps = appsOk ? await appsRes.json() : { consumers: [] };
      const stats = statsOk ? await statsRes.json() : {};
      const vehicles = vehiclesRes.ok ? await vehiclesRes.json() : { total: 0 };
      const vendors = vendorsRes.ok ? await vendorsRes.json() : {};
      const places = placesRes.ok ? await placesRes.json() : { pending: 0 };

      const nextScores: Score[] = quality.scores || [];
      setScores(qualityOk ? nextScores : []);
      setChanges(changesOk ? (changeBody.changes || []) : []);
      setConsumers(appsOk ? (apps.consumers || []) : []);
      const latest = nextScores
        .map((row) => row.checked_at)
        .filter((value): value is string => !!value)
        .sort()
        .at(-1) ?? null;
      setScoredAt(qualityOk ? latest : null);

      const totalStations = stats.fuelStationCount;
      const verifiedStations = stats.stationVerified;
      const countsKnown = statsOk
        && typeof totalStations === 'number'
        && typeof verifiedStations === 'number';
      setStationsFailed(!countsKnown);
      setStationLine(countsKnown ? `${verifiedStations} verified of ${totalStations}` : null);
      const vendorList = Array.isArray(vendors) ? vendors : vendors.vendors || vendors.items || [];
      setPlacesWaiting(placesRes.ok ? Number(places.pending || 0) : null);
      setVehiclesWaiting(vehiclesRes.ok ? Number(vehicles.total || 0) : null);
      setVendorsWaiting(vendorsRes.ok ? Number(vendors.total ?? vendorList.length ?? 0) : null);
    } catch {
      setFailed(true);
      setPlacesWaiting(null);
      setVehiclesWaiting(null);
      setVendorsWaiting(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [accessToken]);

  if (loading) return <DominionLoading />;
  if (failed) return <DominionError onRetry={() => void load()} />;

  const changeRequestCount = placesWaiting !== null && vehiclesWaiting !== null && vendorsWaiting !== null
    ? placesWaiting + vehiclesWaiting + vendorsWaiting
    : null;
  const waitingCards = [
    { id: 'places', label: 'Places', count: placesWaiting, page: 'plug-places' },
    { id: 'vehicles', label: 'Vehicles', count: vehiclesWaiting, page: 'pending-motor-vehicles' },
    { id: 'vendors', label: 'Vendors', count: vendorsWaiting, page: 'pending-vendor-requests' },
    { id: 'changes', label: 'Change requests', count: changeRequestCount, page: 'change-requests' },
  ];

  const scoreByDataset = new Map(scores.map((row) => [row.dataset || '', row]));
  const qualityRows = QUALITY_ORDER.map((dataset) => scoreByDataset.get(dataset) || { dataset, score: null });
  for (const row of scores) {
    const key = row.dataset || '';
    if (key && !QUALITY_ORDER.includes(key) && key !== 'gct_rates') {
      qualityRows.push(row);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-6">
        <div>
          <nav className="mb-1 flex items-center gap-1.5 text-xs font-normal text-slate-500" aria-label="Breadcrumb">
            <span>Dominion</span>
            <span className="text-slate-400">/</span>
            <span className="font-medium text-slate-700">Overview</span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Overview</h1>
        </div>
        <div className="flex items-center gap-2">
          {(qualityFailed || changesFailed || appsFailed || stationsFailed) ? (
            <button
              type="button"
              className="text-xs font-medium text-dominion-reject"
              onClick={() => void load()}
            >
              Retry
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Sync System
          </button>
          <button
            type="button"
            disabled
            title="Session controls stay in the shell"
            className="rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm opacity-60"
          >
            New Session
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {waitingCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onNavigate(card.page)}
                className="rounded-xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition-all hover:border-slate-300"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{card.label}</span>
                  <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    Waiting
                  </span>
                </div>
                <div className="mt-3 text-2xl font-semibold text-slate-800">
                  {card.count === null ? '—' : card.count}
                </div>
              </button>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm xl:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Data quality</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {scoredAt
                    ? `Last scored ${when(scoredAt)}`
                    : 'Status and health diagnostics across master entities'}
                </p>
              </div>
            </div>
            {qualityFailed ? (
              <p className="px-5 py-6 text-sm text-dominion-reject">Could not load this page</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {qualityRows.map((row) => {
                  const key = row.dataset || 'dataset';
                  const label = DATASET_LABEL[key] || key;
                  const value = key === 'stations' && stationLine
                    ? stationLine
                    : typeof row.score === 'number'
                      ? `${row.score}`
                      : null;
                  const loaded = value !== null;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onNavigate(DATASET_PAGE[key] || 'dashboard')}
                      className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-slate-50/60"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-1.5 w-1.5 rounded-full ${loaded ? 'bg-[#316bf3]' : 'bg-slate-300'}`} />
                        <span className="text-sm font-medium text-slate-700">{label}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="inline-flex items-center rounded-full border border-slate-200/60 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          {loaded ? 'Loaded' : 'Not loaded'}
                        </span>
                        <span className="w-auto min-w-8 text-right text-sm font-medium text-slate-500">
                          {value ?? '—'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm xl:col-span-1">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Apps last sync</h2>
              <p className="mt-0.5 text-xs text-slate-500">Runtime distribution endpoints</p>
            </div>
            {appsFailed ? (
              <p className="px-5 py-6 text-sm text-dominion-reject">Could not load this page</p>
            ) : consumers.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">The data is not in yet.</p>
            ) : (
              <div className="flex-1 divide-y divide-slate-100">
                {consumers.map((app) => (
                  <div
                    key={app.app_key || app.name}
                    className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-slate-50/60"
                  >
                    <span className="text-sm font-medium text-slate-800">{app.name || app.app_key}</span>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>Last sync</span>
                      <span className="text-sm font-medium text-slate-700">
                        {app.last_sync_at ? when(app.last_sync_at) : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Recent changes</h2>
              <p className="mt-0.5 text-xs text-slate-500">Audit trail of updates and manual modifications</p>
            </div>
          </div>
          {changesFailed ? (
            <p className="px-5 py-6 text-sm text-dominion-reject">Could not load this page</p>
          ) : changes.length === 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/75 font-semibold text-slate-600">
                    <th className="w-1/4 px-5 py-3">When</th>
                    <th className="w-1/4 px-5 py-3">Dataset</th>
                    <th className="w-1/4 px-5 py-3">Who</th>
                    <th className="w-1/4 px-5 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-xs font-normal text-slate-400">
                      The data is not in yet.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/75 font-semibold text-slate-600">
                    <th className="w-1/4 px-5 py-3">When</th>
                    <th className="w-1/4 px-5 py-3">Dataset</th>
                    <th className="w-1/4 px-5 py-3">Who</th>
                    <th className="w-1/4 px-5 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-5 py-3 text-slate-500">{when(row.created_at)}</td>
                      <td className="px-5 py-3 text-slate-700">{row.dataset || '—'}</td>
                      <td className="px-5 py-3 text-slate-700">{row.actor || '—'}</td>
                      <td className="px-5 py-3 text-slate-700">{row.reason || row.action || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
