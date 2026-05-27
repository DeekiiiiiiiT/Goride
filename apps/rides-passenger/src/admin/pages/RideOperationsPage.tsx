import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { RideRequestRow } from '@roam/types/rides';
import { listRidesDashboardView } from '../services/ridesAdminService';

interface OutletContext {
  session: Session;
  role: string | undefined;
}

function formatGpsAge(iso: string | null | undefined): string {
  if (!iso) return 'No GPS';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

function statusBadge(status: RideRequestRow['status']): string {
  switch (status) {
    case 'matching':
      return 'bg-amber-500/20 text-amber-300';
    case 'driver_en_route_pickup':
      return 'bg-blue-500/20 text-blue-300';
    case 'driver_arrived_pickup':
      return 'bg-violet-500/20 text-violet-300';
    case 'on_trip':
      return 'bg-emerald-500/20 text-emerald-300';
    default:
      return 'bg-slate-500/20 text-slate-300';
  }
}

export function RideOperationsPage() {
  const { session, role } = useOutletContext<OutletContext>();
  const [rides, setRides] = useState<RideRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session.access_token) return;
    setRefreshing(true);
    try {
      const { rides: next } = await listRidesDashboardView(session.access_token, 'active_rides');
      setRides(next ?? []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load active rides');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Ride Operations</h2>
          <p className="text-sm text-slate-400 mt-1">
            Active rides with last driver GPS and lifecycle status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : rides.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center text-slate-400">
          No active rides right now.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Ride</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last GPS</th>
                  <th className="px-4 py-3 font-medium">Pickup</th>
                  <th className="px-4 py-3 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {rides.map((ride) => (
                  <tr key={ride.id} className="border-b border-slate-800/80 hover:bg-slate-900/30">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {ride.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(ride.status)}`}
                      >
                        {ride.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatGpsAge(ride.last_driver_location_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate">
                      {ride.pickup_address ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {ride.complete_suggested_at ? 'Complete suggested' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Role: <span className="font-mono">{role || 'unknown'}</span> · Refreshes every 30s
      </p>
    </div>
  );
}
