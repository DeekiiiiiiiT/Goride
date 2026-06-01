import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Car,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  User,
  XCircle,
} from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { cn } from '@roam/ui';
import type { RoutePoint } from '../../types/tripSession';
import { LeafletMap } from '../maps/LeafletMap';
import { DriverGpsBadge } from './DriverGpsBadge';
import { pickupArrivalLabel } from './rideGeofenceClient';
import type { DriverRideLocationLive } from '../../services/ridesDriverEdge';
import { GracePeriodCountdown, isGracePeriodActive } from './GracePeriodCountdown';
import { RideChatUnreadDot } from '@roam/ride-chat';
import { DriverRideChatWrap } from './DriverRideChatWrap';
import { PickupArrivalCountdown } from './PickupArrivalCountdown';

const CANCEL_REASONS = [
  { value: 'rider_no_show', label: 'Rider no-show' },
  { value: 'wrong_address', label: 'Wrong address' },
  { value: 'vehicle_issue', label: 'Vehicle issue' },
  { value: 'other', label: 'Other' },
];

type WaitTimeInfo = {
  wait_time_charge_enabled?: boolean;
  wait_time_grace_remaining_seconds?: number;
  wait_time_grace_expired?: boolean;
};

type Props = {
  ride: RideRequestRow;
  onAdvance: (
    status: RideRequestRow['status'],
    reason?: string,
    verificationPin?: string,
  ) => Promise<void>;
  trackingError?: string | null;
  gpsAccuracyM?: number | null;
  waitTimeInfo?: WaitTimeInfo | null;
  rideLocationLive?: DriverRideLocationLive | null;
};

function isValidCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function shortAddress(address: string | null | undefined): string {
  const trimmed = address?.trim();
  if (!trimmed) return 'Pickup location';
  const parts = trimmed.split(',').map((p) => p.trim());
  if (parts.length <= 2) return trimmed;
  return `${parts[0]}, ${parts[parts.length - 2]}`;
}

export function EnRoutePickupPanel({
  ride,
  onAdvance,
  trackingError,
  gpsAccuracyM,
  waitTimeInfo,
  rideLocationLive,
}: Props) {
  const [advancing, setAdvancing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0].value);

  const arrival = pickupArrivalLabel(ride, rideLocationLive?.distance_to_pickup_m);
  const atPickupZone = Boolean(ride.wait_time_started_at);
  const graceActive = isGracePeriodActive(waitTimeInfo, ride.wait_time_started_at);
  const pickupAddress = shortAddress(ride.pickup_address);
  const pickupValid = isValidCoord(ride.pickup_lat, ride.pickup_lng);

  const mapRoute = useMemo((): RoutePoint[] => {
    if (!pickupValid) return [];
    const now = Date.now();
    const points: RoutePoint[] = [];
    if (
      ride.last_driver_lat != null &&
      ride.last_driver_lng != null &&
      isValidCoord(ride.last_driver_lat, ride.last_driver_lng)
    ) {
      points.push({ lat: ride.last_driver_lat, lon: ride.last_driver_lng, timestamp: now });
    }
    points.push({ lat: ride.pickup_lat, lon: ride.pickup_lng, timestamp: now });
    return points;
  }, [
    pickupValid,
    ride.last_driver_lat,
    ride.last_driver_lng,
    ride.pickup_lat,
    ride.pickup_lng,
    ride.updated_at,
  ]);

  const runAdvance = async (status: RideRequestRow['status'], reason?: string) => {
    setAdvancing(true);
    try {
      await onAdvance(status, reason);
      setCancelOpen(false);
    } finally {
      setAdvancing(false);
    }
  };

  useEffect(() => {
    if (!cancelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCancelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelOpen]);

  return (
    <DriverRideChatWrap ride={ride}>
      {(openChat, { unreadCount }) => (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f9fb] dark:bg-slate-950">
      <div className="relative h-[30vh] min-h-[130px] max-h-[180px] shrink-0">
        <div className="en-route-map-tiles absolute inset-0">
          {pickupValid ? (
            <LeafletMap
              height="100%"
              routeColor="#00C4B4"
              route={mapRoute.length > 1 ? mapRoute : []}
              startMarker={
                mapRoute.length > 0
                  ? { lat: mapRoute[0].lat, lon: mapRoute[0].lon }
                  : { lat: ride.pickup_lat, lon: ride.pickup_lng }
              }
              endMarker={{ lat: ride.pickup_lat, lon: ride.pickup_lng }}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-slate-200 dark:bg-slate-800">
              <p className="text-sm text-slate-500">Map unavailable</p>
            </div>
          )}
        </div>
        <div className="en-route-map-gradient pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white drop-shadow-md">En route</p>
          <span className="pointer-events-auto scale-90 origin-top-left rounded-full bg-white/90 px-2 py-0.5 shadow-md backdrop-blur-sm">
            <DriverGpsBadge accuracyMeters={gpsAccuracyM ?? null} />
          </span>
        </div>
      </div>

      <div className="relative z-10 -mt-6 flex min-h-0 flex-1 flex-col rounded-t-[28px] bg-[#f7f9fb] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] dark:bg-slate-950">
        <div className="mx-auto mt-3 mb-2 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {trackingError ? (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {trackingError}
            </p>
          ) : null}

          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/50">
              <User className="h-5 w-5 text-blue-700 dark:text-blue-300" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">Passenger</h2>
              <p className="text-xs text-slate-500">Rider trip</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Arrival</p>
              <p className="text-base font-semibold text-[#00C4B4]">{arrival.primary}</p>
            </div>
          </div>

          <div className="mb-3 flex items-start gap-3 rounded-xl bg-slate-100 p-3 dark:bg-slate-800/80">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#004ac6] dark:text-blue-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pickup</p>
              <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-white">{pickupAddress}</p>
            </div>
          </div>

          <GracePeriodCountdown
            waitTimeInfo={waitTimeInfo}
            graceStartedAt={ride.wait_time_started_at}
          />

          {atPickupZone ? (
            <PickupArrivalCountdown waitTimeStartedAt={ride.wait_time_started_at} />
          ) : !graceActive ? (
            <p className="mb-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
              Arrival confirms automatically at the pickup point.
            </p>
          ) : null}

          <div className="mb-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={openChat}
              className="relative flex flex-col items-center justify-center gap-0.5 rounded-xl bg-slate-200/80 py-2.5 text-slate-600 active:scale-95 dark:bg-slate-800 dark:text-slate-300"
              aria-label={unreadCount > 0 ? `Message, ${unreadCount} unread` : 'Message passenger'}
            >
              <span className="relative inline-flex">
                <MessageCircle className="h-4 w-4" aria-hidden />
                <RideChatUnreadDot show={unreadCount > 0} className="-right-1 -top-1" />
              </span>
              <span className="text-[11px] font-semibold">Message</span>
            </button>
            <button
              type="button"
              onClick={() => toast.message('Calling coming soon')}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-slate-200/80 py-2.5 text-slate-600 active:scale-95 dark:bg-slate-800 dark:text-slate-300"
            >
              <Phone className="h-4 w-4" aria-hidden />
              <span className="text-[11px] font-semibold">Call</span>
            </button>
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-red-50 py-2.5 text-red-800 active:scale-95 dark:bg-red-950/40 dark:text-red-300"
            >
              <XCircle className="h-4 w-4" aria-hidden />
              <span className="text-[11px] font-semibold">Cancel</span>
            </button>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200/80 bg-[#f7f9fb] px-4 py-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950">
          <button
            type="button"
            disabled={advancing}
            onClick={() => void runAdvance('driver_arrived_pickup')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00C4B4] py-3.5 text-base font-bold uppercase tracking-wide text-white shadow-lg shadow-[#00C4B4]/20 transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {advancing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Updating…
              </>
            ) : (
              <>
                <Car className="h-5 w-5" aria-hidden />
                I&apos;ve arrived
              </>
            )}
          </button>
        </div>
      </div>

      {cancelOpen ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            role="dialog"
            aria-labelledby="cancel-ride-title"
          >
            <h3 id="cancel-ride-title" className="text-base font-semibold text-red-700 dark:text-red-400">
              Cancel this ride?
            </h3>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
            >
              {CANCEL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium dark:border-slate-700"
                onClick={() => setCancelOpen(false)}
              >
                Keep ride
              </button>
              <button
                type="button"
                disabled={advancing}
                className={cn(
                  'flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white',
                  advancing && 'opacity-60',
                )}
                onClick={() => void runAdvance('cancelled', cancelReason)}
              >
                Confirm cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
      )}
    </DriverRideChatWrap>
  );
}
