import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { RideRequestRow } from '@roam/types/rides';
import type { TollCrossingDto } from '@roam/types/tollCrossings';
import { AdminLiveTollMonitor, AdminTripTollDrawer } from '@roam/toll-ui';
import type { LiveTollTripRow } from '@roam/toll-ui';
import { useAuth } from '../components/auth/AuthContext';
import {
  fetchRideTollCrossingsAdmin,
  listActiveRidesForTollMonitor,
} from '../services/platform/ridesTollMonitorService';

function gpsAgeSec(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 1000);
}

function toMonitorRow(ride: RideRequestRow): LiveTollTripRow {
  const tollTotalMinor = Number(ride.actual_tolls_minor ?? 0);
  return {
    rideId: ride.id,
    status: ride.status,
    lastGpsAgeSec: gpsAgeSec(ride.last_driver_location_at),
    tollCount: tollTotalMinor > 0 ? 1 : 0,
    tollTotalMinor,
    lastPlazaName: null,
    flagged: gpsAgeSec(ride.last_driver_location_at) != null && gpsAgeSec(ride.last_driver_location_at)! > 900,
  };
}

export function TollLiveMonitorPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [rides, setRides] = useState<RideRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'has_tolls' | 'no_tolls'>('all');
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [drawerCrossings, setDrawerCrossings] = useState<TollCrossingDto[]>([]);
  const [drawerTotal, setDrawerTotal] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const next = await listActiveRidesForTollMonitor(token);
      setRides(next);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load active rides');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const openDrawer = useCallback(
    async (rideId: string) => {
      setSelectedRideId(rideId);
      if (!token) return;
      try {
        const res = await fetchRideTollCrossingsAdmin(token, rideId);
        setDrawerCrossings(res.crossings ?? []);
        setDrawerTotal(res.actual_tolls_minor ?? 0);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Could not load toll crossings');
        setDrawerCrossings([]);
        setDrawerTotal(0);
      }
    },
    [token],
  );

  const trips = useMemo(() => rides.map(toMonitorRow), [rides]);
  const currency = rides[0]?.currency ?? 'JMD';

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Live toll monitor</h1>
          <p className="text-sm text-slate-500 mt-1">
            Active Roam Rides trips with GPS freshness and toll totals. Requires toll detection enabled.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <AdminLiveTollMonitor
          trips={trips}
          filter={filter}
          onFilterChange={setFilter}
          onSelectTrip={(id) => void openDrawer(id)}
          state={trips.length === 0 ? 'empty' : 'data'}
          currency={currency}
        />
      )}

      <AdminTripTollDrawer
        rideId={selectedRideId}
        crossings={drawerCrossings}
        actualTollsMinor={drawerTotal}
        currency={currency}
        onClose={() => setSelectedRideId(null)}
      />
    </div>
  );
}
