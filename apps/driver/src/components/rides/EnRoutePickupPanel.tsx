import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Car,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Star,
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
    <div className="flex h-full min-h-0 flex-col bg-[#f7f9fb] dark:bg-slate-950">
      <div className="relative h-[42vh] min-h-[200px] shrink-0">
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
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-widest text-white drop-shadow-md">En route</p>
          <span className="pointer-events-auto rounded-full bg-white/90 px-2 py-1 shadow-md backdrop-blur-sm">
            <DriverGpsBadge accuracyMeters={gpsAccuracyM ?? null} />
          </span>
        </div>
      </div>

      <div className="relative z-10 -mt-8 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-[32px] bg-[#f7f9fb] px-5 pb-6 pt-8 shadow-[0_-10px_30px_rgba(0,0,0,0.06)] dark:bg-slate-950">
        <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />

        {trackingError ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            {trackingError}
          </p>
        ) : null}

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-100 shadow-md dark:bg-blue-950/50">
              <User className="h-8 w-8 text-blue-700 dark:text-blue-300" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-slate-900 dark:text-white">Passenger</h2>
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
                <span className="text-sm">Rider trip</span>
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Arrival
            </p>
            <p className="text-xl font-semibold text-[#00C4B4]">{arrival.primary}</p>
            {arrival.secondary ? (
              <p className="mt-0.5 max-w-[9rem] text-right text-[11px] text-slate-500 dark:text-slate-400">
                {arrival.secondary}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mb-4 flex items-start gap-4 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/80">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/60">
            <MapPin className="h-5 w-5 text-[#004ac6] dark:text-blue-400" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Pickup address
            </p>
            <p className="text-base font-semibold text-slate-900 dark:text-white">{pickupAddress}</p>
          </div>
        </div>

        <GracePeriodCountdown
          waitTimeInfo={waitTimeInfo}
          graceStartedAt={ride.wait_time_started_at}
        />

        {!graceActive ? (
          atPickupZone ? (
            <p className="mb-4 text-center text-xs font-medium text-emerald-700 dark:text-emerald-400">
              You&apos;re in the pickup zone. Arrival should confirm in a few seconds — use
              &quot;I&apos;ve arrived&quot; if it doesn&apos;t.
            </p>
          ) : (
            <p className="mb-4 text-center text-xs text-slate-500 dark:text-slate-400">
              Arrival is detected automatically when you reach the pickup point.
            </p>
          )
        ) : null}

        <div className="mb-4 grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => toast.message('Messaging coming soon')}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-slate-200/80 py-3 text-slate-600 transition-transform active:scale-95 dark:bg-slate-800 dark:text-slate-300"
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
            <span className="text-sm font-semibold">Message</span>
          </button>
          <button
            type="button"
            onClick={() => toast.message('Calling coming soon')}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-slate-200/80 py-3 text-slate-600 transition-transform active:scale-95 dark:bg-slate-800 dark:text-slate-300"
          >
            <Phone className="h-5 w-5" aria-hidden />
            <span className="text-sm font-semibold">Call</span>
          </button>
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-red-50 py-3 text-red-800 transition-transform active:scale-95 dark:bg-red-950/40 dark:text-red-300"
          >
            <XCircle className="h-5 w-5" aria-hidden />
            <span className="text-sm font-semibold">Cancel</span>
          </button>
        </div>

        <button
          type="button"
          disabled={advancing}
          onClick={() => void runAdvance('driver_arrived_pickup')}
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00C4B4] py-4 text-lg font-bold uppercase tracking-wider text-white shadow-lg shadow-[#00C4B4]/20 transition-transform active:scale-[0.98] disabled:opacity-60"
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
  );
}
