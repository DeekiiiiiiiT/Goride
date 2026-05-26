import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { RideRequestRow, RideRequestStatus } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import {
  listRidesDashboardView,
  listSurgeCells,
  type DashboardOnlineDriverRow,
  type RidesDashboardTab,
} from '../services/ridesAdminService';
import type { SurgeCellAdminRow } from '../services/ridesAdminService';

const TAB_META: Record<RidesDashboardTab, { label: string; description: string }> = {
  active_rides: {
    label: 'Active rides',
    description: 'Matching or in progress (up to 100, newest first).',
  },
  riders_on_trip: {
    label: 'Riders on trip',
    description: 'Trips with a driver assigned through on trip.',
  },
  todays_rides: {
    label: "Today's rides",
    description: 'Completed today (UTC).',
  },
  drivers_online: {
    label: 'Drivers online',
    description: 'Available for dispatch (fresh GPS, not on another trip).',
  },
  surge: {
    label: 'Surge cells',
    description: 'Current surge multipliers by grid cell.',
  },
};

function statusLabel(status: RideRequestStatus): string {
  return status.replace(/_/g, ' ');
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function truncate(s: string | null | undefined, max = 36): string {
  if (!s) return '—';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

type Props = {
  accessToken: string;
  activeTab: RidesDashboardTab;
  onTabChange: (tab: RidesDashboardTab) => void;
};

export function RidesDashboardDrilldown({ accessToken, activeTab, onTabChange }: Props) {
  const [rides, setRides] = useState<RideRequestRow[]>([]);
  const [drivers, setDrivers] = useState<DashboardOnlineDriverRow[]>([]);
  const [cells, setCells] = useState<SurgeCellAdminRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      if (activeTab === 'surge') {
        const res = await listSurgeCells(accessToken, { limit: 100 });
        setCells(res.cells);
        setRides([]);
        setDrivers([]);
      } else {
        const res = await listRidesDashboardView(accessToken, activeTab);
        setRides(res.rides ?? []);
        setDrivers(res.drivers ?? []);
        setCells([]);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load list');
      setRides([]);
      setDrivers([]);
      setCells([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeTab]);

  useEffect(() => {
    void load();
  }, [load]);

  const meta = TAB_META[activeTab];
  const isEmpty =
    activeTab === 'surge'
      ? cells.length === 0
      : activeTab === 'drivers_online'
        ? drivers.length === 0
        : rides.length === 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
      <div className="flex flex-wrap gap-1 p-2 border-b border-slate-800 bg-slate-900/50">
        {(Object.keys(TAB_META) as RidesDashboardTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-violet-500/20 text-violet-200 border border-violet-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent'
            }`}
          >
            {TAB_META[tab].label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800/80">
        <div>
          <p className="text-sm font-medium text-white">{meta.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-14 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      ) : isEmpty ? (
        <p className="text-center py-14 text-slate-500 text-sm">Nothing in this view right now.</p>
      ) : activeTab === 'surge' ? (
        <SurgeTable cells={cells} />
      ) : activeTab === 'drivers_online' ? (
        <DriversTable drivers={drivers} />
      ) : (
        <RidesTable rides={rides} showRiderLink />
      )}

      {!loading && !isEmpty && (
        <p className="px-4 py-2 text-xs text-slate-600 border-t border-slate-800/80">
          {activeTab === 'surge' && (
            <>
              Showing {cells.length} cell{cells.length === 1 ? '' : 's'}.{' '}
              <Link to="/admin/surge" className="text-violet-400 hover:text-violet-300">
                Open surge pricing →
              </Link>
            </>
          )}
          {activeTab === 'drivers_online' && (
            <>Showing {drivers.length} driver{drivers.length === 1 ? '' : 's'}.</>
          )}
          {activeTab !== 'surge' && activeTab !== 'drivers_online' && (
            <>
              Showing {rides.length} ride{rides.length === 1 ? '' : 's'}.{' '}
              <Link to="/admin/users" className="text-violet-400 hover:text-violet-300">
                Open rider directory →
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function RidesTable({ rides, showRiderLink }: { rides: RideRequestRow[]; showRiderLink: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-slate-500">
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Pickup</th>
            <th className="px-4 py-3 font-medium">Drop-off</th>
            <th className="px-4 py-3 font-medium">Fare est.</th>
            {showRiderLink && <th className="px-4 py-3 font-medium">Rider</th>}
            <th className="px-4 py-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rides.map((r) => (
            <tr
              key={r.id}
              className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors"
            >
              <td className="px-4 py-3 capitalize text-slate-300">{statusLabel(r.status)}</td>
              <td className="px-4 py-3 text-slate-400 max-w-[160px] truncate" title={r.pickup_address ?? undefined}>
                {truncate(r.pickup_address)}
              </td>
              <td className="px-4 py-3 text-slate-400 max-w-[160px] truncate" title={r.dropoff_address ?? undefined}>
                {truncate(r.dropoff_address)}
              </td>
              <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                {formatMoneyMinor(r.fare_estimate_minor, r.currency ?? 'JMD')}
              </td>
              {showRiderLink && (
                <td className="px-4 py-3">
                  <Link
                    to={`/admin/users/${r.rider_user_id}`}
                    className="text-violet-400 hover:text-violet-300 text-xs font-mono"
                  >
                    {r.rider_user_id.slice(0, 8)}…
                  </Link>
                </td>
              )}
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatWhen(r.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriversTable({ drivers }: { drivers: DashboardOnlineDriverRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-slate-500">
            <th className="px-4 py-3 font-medium">Driver</th>
            <th className="px-4 py-3 font-medium">Body type</th>
            <th className="px-4 py-3 font-medium">Last GPS</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr
              key={d.user_id}
              className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors"
            >
              <td className="px-4 py-3">
                <p className="font-medium text-white">{d.display_name || 'Driver'}</p>
                <p className="text-xs text-slate-500 font-mono">{d.user_id.slice(0, 8)}…</p>
              </td>
              <td className="px-4 py-3 text-slate-400">{d.body_type_slug ?? '—'}</td>
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatWhen(d.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SurgeTable({ cells }: { cells: SurgeCellAdminRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-slate-500">
            <th className="px-4 py-3 font-medium">Cell</th>
            <th className="px-4 py-3 font-medium">Multiplier</th>
            <th className="px-4 py-3 font-medium">Open requests</th>
            <th className="px-4 py-3 font-medium">Drivers</th>
            <th className="px-4 py-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((c) => (
            <tr
              key={c.cell_key}
              className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors"
            >
              <td className="px-4 py-3 font-mono text-slate-300 text-xs">{c.cell_key}</td>
              <td className="px-4 py-3 text-white">{Number(c.surge_multiplier).toFixed(2)}</td>
              <td className="px-4 py-3 text-slate-400">{c.open_requests}</td>
              <td className="px-4 py-3 text-slate-400">{c.available_drivers}</td>
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatWhen(c.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
