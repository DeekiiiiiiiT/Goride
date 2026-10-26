// Stitch: dominion-redesign/282dc999dca64dcfbb7050e1bf24254b
import React, { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { DominionEmpty, DominionError, DominionLoading } from './DominionStates';

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
  const qualityRows = (scores.length
    ? scores
    : Object.keys(DATASET_LABEL).map((dataset): Score => ({ dataset, score: null }))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Overview</h1>
      {(qualityFailed || changesFailed || appsFailed || stationsFailed) ? (
        <div className="flex justify-end">
          <button type="button" className="text-sm font-medium text-dominion-reject" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {waitingCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onNavigate(card.page)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left"
          >
            <p className="text-sm font-medium text-slate-700">{card.label}</p>
            <p className="mt-2 font-mono text-2xl text-slate-900">{card.count === null ? '—' : card.count}</p>
            <p className="mt-1 text-xs text-slate-400">Waiting</p>
          </button>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
          Data quality
          <span className="ml-2 font-normal text-slate-400">{scoredAt ? when(scoredAt) : ''}</span>
        </h2>
        {qualityFailed ? (
          <p className="px-4 py-6 text-sm text-dominion-reject">Could not load this page</p>
        ) : qualityRows.map((row) => {
          const key = row.dataset || 'dataset';
          const label = key === 'tolls' ? 'Toll plazas' : (DATASET_LABEL[key] || key);
          const value = key === 'stations' && stationLine
            ? stationLine
            : typeof row.score === 'number'
              ? `${row.score}`
              : null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(DATASET_PAGE[key] || 'dashboard')}
              className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-b-0"
            >
              <span className="text-sm text-slate-800">{label}</span>
              <span className="flex items-center gap-3">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                  {value === null ? 'Not loaded' : 'Loaded'}
                </span>
                <span className="font-mono text-sm text-slate-700">{value ?? '—'}</span>
              </span>
            </button>
          );
        })}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">Apps last sync</h2>
        {appsFailed ? (
          <p className="px-4 py-6 text-sm text-dominion-reject">Could not load this page</p>
        ) : consumers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">The data is not in yet.</p>
        ) : (
          <ul>
            {consumers.map((app) => (
              <li key={app.app_key || app.name} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0">
                <span className="text-sm text-slate-800">{app.name || app.app_key}</span>
                <span className="font-mono text-xs text-slate-500">{app.last_sync_at ? when(app.last_sync_at) : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">Recent changes</h2>
        {changesFailed ? (
          <p className="px-4 py-6 text-sm text-dominion-reject">Could not load this page</p>
        ) : changes.length === 0 ? (
          <DominionEmpty />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Dataset</th>
                <th className="px-4 py-2 font-medium">Who</th>
                <th className="px-4 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-500">{when(row.created_at)}</td>
                  <td className="px-4 py-3">{row.dataset || '—'}</td>
                  <td className="px-4 py-3">{row.actor || '—'}</td>
                  <td className="px-4 py-3">{row.reason || row.action || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
