import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { RideRequestRow } from '@roam/types/rides';
import { AdminCashSettleModal } from '../components/AdminCashSettleModal';
import { AdminCashTripActions } from '../components/AdminCashTripActions';
import {
  adminForceCancelRide,
  adminForceCompleteRide,
  adminFetchTollCrossings,
  adminReleaseCashSettlement,
  adminSettleCashRide,
  listRidesDashboardView,
} from '../services/ridesAdminService';
import { AdminTripTollDrawer } from '@roam/toll-ui';
import type { TollCrossingDto } from '@roam/types/tollCrossings';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';

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
    case 'awaiting_cash_settlement':
      return 'bg-amber-500/20 text-amber-300';
    default:
      return 'bg-slate-500/20 text-slate-300';
  }
}

function isStaleGps(iso: string | null | undefined, thresholdMs = 15 * 60_000): boolean {
  if (!iso) return true;
  const ms = Date.now() - Date.parse(iso);
  return !Number.isFinite(ms) || ms >= thresholdMs;
}

export function RideOperationsPage() {
  const { session, role } = useOutletContext<OutletContext>();
  const { confirm } = useAdminConfirm();
  const [rides, setRides] = useState<RideRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [settleRide, setSettleRide] = useState<RideRequestRow | null>(null);
  const [tollRideId, setTollRideId] = useState<string | null>(null);
  const [tollCrossings, setTollCrossings] = useState<TollCrossingDto[]>([]);
  const [tollTotalMinor, setTollTotalMinor] = useState(0);

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

  const runCancel = async (ride: RideRequestRow) => {
    const stale = isStaleGps(ride.last_driver_location_at);
    const msg = stale
      ? `Cancel ride ${ride.id.slice(0, 8)}…? Driver GPS is stale — this will clear the stuck trip.`
      : `Cancel ride ${ride.id.slice(0, 8)}…?`;
    const ok = await confirm({
      title: 'Cancel ride?',
      description: msg,
      confirmLabel: 'Cancel ride',
      variant: 'danger',
    });
    if (!ok) return;

    setActingId(ride.id);
    try {
      await adminForceCancelRide(session.access_token, ride.id, 'admin_stuck_trip');
      toast.success('Ride cancelled');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setActingId(null);
    }
  };

  const runRelease = async (ride: RideRequestRow) => {
    const ok = await confirm({
      title: 'Release to cash settlement?',
      description: `Release ride ${ride.id.slice(0, 8)}… to cash settlement? Driver must enter cash received.`,
      confirmLabel: 'Release',
    });
    if (!ok) return;
    setActingId(ride.id);
    try {
      await adminReleaseCashSettlement(session.access_token, ride.id);
      toast.success('Released to cash settlement');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Release failed');
    } finally {
      setActingId(null);
    }
  };

  const runCompleteCard = async (ride: RideRequestRow) => {
    const ok = await confirm({
      title: 'Mark ride completed?',
      description: `Mark ride ${ride.id.slice(0, 8)}… completed? Use only if the passenger was dropped off.`,
      confirmLabel: 'Complete',
      variant: 'danger',
    });
    if (!ok) return;
    setActingId(ride.id);
    try {
      await adminForceCompleteRide(session.access_token, ride.id);
      toast.success('Ride marked completed');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Complete failed');
    } finally {
      setActingId(null);
    }
  };

  const openTolls = async (ride: RideRequestRow) => {
    setTollRideId(ride.id);
    try {
      const res = await adminFetchTollCrossings(session.access_token, ride.id);
      setTollCrossings(res.crossings ?? []);
      setTollTotalMinor(res.actual_tolls_minor ?? 0);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not load tolls');
      setTollCrossings([]);
      setTollTotalMinor(0);
    }
  };

  const runSettle = async (cashReceivedMinor: number) => {
    if (!settleRide) return;
    setActingId(settleRide.id);
    try {
      const result = await adminSettleCashRide(
        session.access_token,
        settleRide.id,
        cashReceivedMinor,
      );
      toast.success(
        result.cash_settlement
          ? `Settled (${result.cash_settlement.outcome})`
          : 'Ride settled and completed',
      );
      setSettleRide(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Settle failed');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Ride Operations</h2>
          <p className="text-sm text-slate-400 mt-1">
            Active rides with last driver GPS and lifecycle status. Cash trips use release → driver
            settlement; card trips can be force-completed.
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
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Last GPS</th>
                  <th className="px-4 py-3 font-medium">Pickup</th>
                  <th className="px-4 py-3 font-medium">Flags</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rides.map((ride) => {
                  const stale = isStaleGps(ride.last_driver_location_at);
                  const busy = actingId === ride.id;
                  return (
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
                      <td className="px-4 py-3 text-slate-400 capitalize text-xs">
                        {ride.payment_method ?? 'cash'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={stale ? 'text-amber-400' : 'text-slate-300'}>
                          {formatGpsAge(ride.last_driver_location_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate">
                        {ride.pickup_address ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {ride.complete_suggested_at ? 'Complete suggested' : stale ? 'Stale GPS' : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <AdminCashTripActions
                            ride={ride}
                            busy={busy}
                            onRelease={runRelease}
                            onSettle={setSettleRide}
                            onCompleteCard={runCompleteCard}
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void openTolls(ride)}
                            className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                          >
                            Tolls
                          </button>
                          <button
                            className="rounded-md border border-red-800/60 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AdminCashSettleModal
        ride={settleRide}
        open={settleRide != null}
        submitting={actingId === settleRide?.id}
        onClose={() => setSettleRide(null)}
        onConfirm={runSettle}
      />

      <AdminTripTollDrawer
        rideId={tollRideId}
        crossings={tollCrossings}
        actualTollsMinor={tollTotalMinor}
        currency={rides[0]?.currency ?? 'JMD'}
        onClose={() => setTollRideId(null)}
      />

      <p className="text-xs text-slate-500">
        Role: <span className="font-mono">{role || 'unknown'}</span> · Refreshes every 30s
      </p>
    </div>
  );
}
