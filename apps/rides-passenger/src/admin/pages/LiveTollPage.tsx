import { useCallback, useEffect, useState } from 'react';
import { supabaseRidesAdmin as supabase } from '@roam/auth-client';
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { AdminLiveTollMonitor, AdminTripTollDrawer, type LiveTollTripRow } from '@roam/toll-ui';
import type { RideRequestRow } from '@roam/types/rides';
import type { TollCrossingDto } from '@roam/types/tollCrossings';
import { adminFetchTollCrossings } from '../services/ridesAdminService';

type ActiveRide = RideRequestRow & {
  toll_crossing_count?: number;
  last_plaza_name?: string | null;
};

function gpsAgeSec(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 1000);
}

function toMonitorRow(ride: ActiveRide): LiveTollTripRow {
  const age = gpsAgeSec(ride.last_driver_location_at);
  const tollTotalMinor = Number(ride.actual_tolls_minor ?? 0);
  const listedCount = Number(ride.toll_crossing_count);
  const tollCount = Number.isFinite(listedCount) ? listedCount : tollTotalMinor > 0 ? 1 : 0;
  return {
    rideId: ride.id,
    status: ride.status,
    lastGpsAgeSec: age,
    tollCount,
    tollTotalMinor,
    lastPlazaName: ride.last_plaza_name ?? null,
    flagged: age != null && age > 900,
  };
}

export function LiveTollPage() {
  const [trips, setTrips] = useState<LiveTollTripRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'has_tolls' | 'no_tolls'>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [drawerCrossings, setDrawerCrossings] = useState<TollCrossingDto[]>([]);
  const [drawerTotal, setDrawerTotal] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again to see live tolls.');
      const res = await fetch(`${API_ENDPOINTS.rides}/admin/dashboard/list?view=active_rides`, {
        headers: { Authorization: `Bearer ${token}`, apikey: publicAnonKey },
      });
      if (!res.ok) throw new Error('Couldn’t load active rides.');
      const body = (await res.json()) as { rides?: ActiveRide[] };
      setTrips((body.rides ?? []).map(toMonitorRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load active rides.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const openDrawer = useCallback(async (rideId: string) => {
    setSelectedRideId(rideId);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    try {
      const res = await adminFetchTollCrossings(token, rideId);
      setDrawerCrossings(res.crossings ?? []);
      setDrawerTotal(res.actual_tolls_minor ?? 0);
    } catch {
      setDrawerCrossings([]);
      setDrawerTotal(0);
    }
  }, []);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Live tolls</h1>
          <p className="text-sm text-slate-400">Active rides and the tolls on them. Refreshes every 30 seconds.</p>
        </div>
        <button type="button" onClick={() => void load()} className="text-sm text-violet-300">
          Refresh
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : (
        <AdminLiveTollMonitor
          trips={trips}
          filter={filter}
          onFilterChange={setFilter}
          onSelectTrip={(rideId) => void openDrawer(rideId)}
          state={loading ? 'loading' : trips.length === 0 ? 'empty' : 'data'}
          currency="JMD"
        />
      )}
      <AdminTripTollDrawer
        rideId={selectedRideId}
        crossings={drawerCrossings}
        actualTollsMinor={drawerTotal}
        currency="JMD"
        onClose={() => setSelectedRideId(null)}
      />
    </div>
  );
}
