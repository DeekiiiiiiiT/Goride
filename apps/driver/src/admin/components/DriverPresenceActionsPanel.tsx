import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, LogOut, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import type { DriverPresenceRow } from '../services/driverAdminService';
import { signOutDriver } from '../services/driverAdminService';
import {
  SUPPORT_CANCEL_REASONS,
  forceCancelRide,
  forceCompleteRide,
  getRideById,
  type SupportCancelReasonCode,
  type SupportRideRow,
} from '../services/supportService';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';

const ACTIVE_RIDE_STATUSES = new Set([
  'matching',
  'driver_assigned',
  'driver_en_route_pickup',
  'driver_arrived_pickup',
  'on_trip',
]);

type Props = {
  driver: DriverPresenceRow;
  token: string;
  canWrite: boolean;
  onRefresh: () => void;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function driverLabel(d: DriverPresenceRow): string {
  if (d.display_name?.trim()) return d.display_name.trim();
  if (d.email?.trim()) return d.email.trim();
  if (d.phone?.trim()) return d.phone.trim();
  return `Driver ${d.driver_id.slice(0, 8)}`;
}

function ActionBtn({
  variant = 'secondary',
  disabled,
  onClick,
  children,
}: {
  variant?: 'primary' | 'danger' | 'success' | 'secondary';
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const styles =
    variant === 'primary'
      ? 'bg-violet-600 hover:bg-violet-500 text-white'
      : variant === 'danger'
        ? 'bg-red-600/90 hover:bg-red-600 text-white'
        : variant === 'success'
          ? 'border border-emerald-700/60 text-emerald-300 hover:bg-emerald-950/40'
          : 'border border-slate-700 text-slate-300 hover:bg-slate-800';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function DriverPresenceActionsPanel({ driver, token, canWrite, onRefresh }: Props) {
  const { confirm } = useAdminConfirm();
  const [acting, setActing] = useState(false);
  const [ride, setRide] = useState<SupportRideRow | null>(null);
  const [rideLoading, setRideLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelCode, setCancelCode] = useState<SupportCancelReasonCode>('stuck_offline');
  const [cancelNote, setCancelNote] = useState('');

  const loadRide = useCallback(async () => {
    if (!token || !driver.ride_id) {
      setRide(null);
      return;
    }
    setRideLoading(true);
    try {
      const { ride: r } = await getRideById(token, driver.ride_id);
      setRide(r);
    } catch {
      setRide(null);
    } finally {
      setRideLoading(false);
    }
  }, [token, driver.ride_id]);

  useEffect(() => {
    void loadRide();
  }, [loadRide]);

  const rideStatus = ride?.status ?? driver.trip_status;
  const isOnTrip = driver.live_status === 'on_trip';
  const isActiveRide = rideStatus ? ACTIVE_RIDE_STATUSES.has(rideStatus) : isOnTrip;
  const canComplete = rideStatus === 'on_trip';

  const handleSignOut = async () => {
    const ok = await confirm({
      title: 'Sign out driver?',
      description: `${driverLabel(driver)} will be signed out on all devices and taken offline immediately.`,
      confirmLabel: 'Sign out',
      variant: 'danger',
    });
    if (!ok) return;
    setActing(true);
    try {
      await signOutDriver(token, driver.driver_id);
      toast.success('Driver signed out from all devices');
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sign out failed');
    } finally {
      setActing(false);
    }
  };

  const handleCancelTrip = async () => {
    const rideId = driver.ride_id ?? ride?.id;
    if (!rideId) return;
    const label = SUPPORT_CANCEL_REASONS.find((r) => r.value === cancelCode)?.label ?? cancelCode;
    const ok = await confirm({
      title: 'Cancel active trip?',
      description: `Cancel ride ${rideId.slice(0, 8)}… (${label}). The driver will be cleared from this trip.`,
      confirmLabel: 'Cancel trip',
      variant: 'danger',
    });
    if (!ok) return;
    setActing(true);
    try {
      await forceCancelRide(token, rideId, {
        support_reason_code: cancelCode,
        support_note: cancelNote,
      });
      toast.success('Trip cancelled');
      setCancelOpen(false);
      setCancelNote('');
      onRefresh();
      void loadRide();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setActing(false);
    }
  };

  const handleCompleteTrip = async () => {
    const rideId = driver.ride_id ?? ride?.id;
    if (!rideId) return;
    const ok = await confirm({
      title: 'Mark trip completed?',
      description: 'Only confirm if the passenger was dropped off. This closes the ride and updates driver status.',
      confirmLabel: 'Mark completed',
    });
    if (!ok) return;
    setActing(true);
    try {
      await forceCompleteRide(token, rideId);
      toast.success('Trip marked completed');
      onRefresh();
      void loadRide();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Complete failed');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="border-t border-slate-800 bg-slate-900/50 p-4 space-y-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{driverLabel(driver)}</h3>
            <p className="text-xs text-slate-500 font-mono truncate">{driver.driver_id}</p>
          </div>
          <span
            className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${
              driver.live_status === 'on_trip'
                ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                : driver.live_status === 'online'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-500/15 text-slate-400 border-slate-600/40'
            }`}
          >
            {driver.live_status.replace(/_/g, ' ')}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-2">Last seen: {formatWhen(driver.last_seen)}</p>
        {driver.lat != null && driver.lng != null && (
          <p className="text-xs font-mono text-slate-600 mt-0.5">
            {driver.lat.toFixed(5)}, {driver.lng.toFixed(5)}
          </p>
        )}
      </div>

      {isOnTrip && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 space-y-2 text-xs">
          <p className="font-medium text-violet-200">Active trip</p>
          {rideLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
          ) : (
            <>
              {rideStatus && (
                <p className="text-slate-400 capitalize">
                  Status: <span className="text-slate-200">{rideStatus.replace(/_/g, ' ')}</span>
                </p>
              )}
              {(driver.pickup_address || ride?.pickup_address) && (
                <p className="text-slate-500">
                  Pickup:{' '}
                  <span className="text-slate-300">
                    {driver.pickup_address ?? ride?.pickup_address}
                  </span>
                </p>
              )}
              {(driver.dropoff_address || ride?.dropoff_address) && (
                <p className="text-slate-500">
                  Drop-off:{' '}
                  <span className="text-slate-300">
                    {driver.dropoff_address ?? ride?.dropoff_address}
                  </span>
                </p>
              )}
              {driver.ride_id && (
                <p className="font-mono text-slate-600 break-all">{driver.ride_id}</p>
              )}
            </>
          )}
        </div>
      )}

      {!canWrite ? (
        <p className="text-xs text-slate-500">Read-only. Driver admin write role required for actions.</p>
      ) : (
        <>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Trip controls</p>
            <div className="flex flex-wrap gap-2">
              {canComplete && (
                <ActionBtn
                  variant="success"
                  disabled={acting || !driver.ride_id}
                  onClick={() => void handleCompleteTrip()}
                >
                  Mark completed
                </ActionBtn>
              )}
              {isActiveRide && (
                <ActionBtn
                  variant="danger"
                  disabled={acting || !driver.ride_id}
                  onClick={() => setCancelOpen(true)}
                >
                  Cancel trip
                </ActionBtn>
              )}
              {driver.ride_id && (
                <Link
                  to={`/support?ride=${encodeURIComponent(driver.ride_id)}`}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  <ExternalLink className="w-3 h-3" />
                  Support tools
                </Link>
              )}
            </div>
            {!isOnTrip && (
              <p className="text-xs text-slate-600 mt-2">No active trip — trip controls unavailable.</p>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">Session controls</p>
            <div className="flex flex-wrap gap-2">
              {(driver.live_status === 'online' || driver.live_status === 'on_trip') && (
                <ActionBtn variant="secondary" disabled={acting} onClick={() => void handleSignOut()}>
                  <span className="inline-flex items-center gap-1.5">
                    <LogOut className="w-3 h-3" />
                    Sign out & go offline
                  </span>
                </ActionBtn>
              )}
              <Link
                to={`/users/${driver.driver_id}`}
                className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-medium border border-slate-700 text-violet-300 hover:bg-slate-800"
              >
                View profile
              </Link>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Sign out ends all app sessions and stops location updates. Use cancel trip first if they are mid-ride.
            </p>
          </div>

          {cancelOpen && isActiveRide && (
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 space-y-2">
              <p className="text-xs font-medium text-white">Cancel reason</p>
              <select
                value={cancelCode}
                onChange={(e) => setCancelCode(e.target.value as SupportCancelReasonCode)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
              >
                {SUPPORT_CANCEL_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <textarea
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                placeholder="Optional audit note…"
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white placeholder:text-slate-600 resize-none"
              />
              <div className="flex gap-2">
                <ActionBtn variant="danger" disabled={acting} onClick={() => void handleCancelTrip()}>
                  {acting ? 'Working…' : 'Confirm cancel'}
                </ActionBtn>
                <ActionBtn disabled={acting} onClick={() => setCancelOpen(false)}>
                  Back
                </ActionBtn>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
