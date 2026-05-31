import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Navigation,
  ShieldAlert,
  Star,
  User,
} from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import type { RoutePoint } from '../../types/tripSession';
import { openExternalNavigation } from '../../utils/rideNavigation';
import { LeafletMap } from '../maps/LeafletMap';
import { formatOfferDistanceMi } from './rideDispatchUtils';
import { RIDE_CANCEL_REASONS } from './rideCancelReasons';
import { RideCancelSheet } from './RideCancelSheet';
import { canCompleteTrip, isInsideDropoffGeofence } from './rideGeofenceClient';
import { DriverRideChatWrap } from './DriverRideChatWrap';

type Props = {
  ride: RideRequestRow;
  onAdvance: (
    status: RideRequestRow['status'],
    reason?: string,
    verificationPin?: string,
  ) => Promise<void>;
  trackingError?: string | null;
  gpsAccuracyM?: number | null;
};

function shortAddress(address: string | null | undefined): string {
  const trimmed = address?.trim();
  if (!trimmed) return 'Drop-off location';
  const parts = trimmed.split(',').map((p) => p.trim());
  if (parts.length <= 2) return trimmed;
  return `${parts[0]}, ${parts[parts.length - 2]}`;
}

function droppingOffMeta(ride: RideRequestRow): { title: string; sub: string; mins: number | null } {
  const mins =
    ride.duration_estimate_minutes != null && Number.isFinite(ride.duration_estimate_minutes)
      ? Math.max(1, Math.round(ride.duration_estimate_minutes))
      : null;
  const eta = new Date();
  if (mins != null) eta.setMinutes(eta.getMinutes() + mins);
  const timeStr = eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return {
    title: 'Dropping off Passenger',
    sub: mins != null ? `ETA ${timeStr} • ${mins} min${mins === 1 ? '' : 's'}` : 'Heading to drop-off',
    mins,
  };
}

export function OnTripPanel({ ride, onAdvance, trackingError, gpsAccuracyM }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(RIDE_CANCEL_REASONS[0].value);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const completeReady = canCompleteTrip(ride);
  const nearDropoff = isInsideDropoffGeofence(ride, null, null, gpsAccuracyM);
  const dropoffAddress = shortAddress(ride.dropoff_address);
  const tripMiles = formatOfferDistanceMi(ride.distance_estimate_km);
  const { title: navTitle, sub: navSub, mins: tripMins } = droppingOffMeta(ride);

  const mapRoute = useMemo((): RoutePoint[] => {
    const now = Date.now();
    const points: RoutePoint[] = [];
    if (ride.last_driver_lat != null && ride.last_driver_lng != null) {
      points.push({ lat: ride.last_driver_lat, lon: ride.last_driver_lng, timestamp: now });
    }
    points.push({ lat: ride.dropoff_lat, lon: ride.dropoff_lng, timestamp: now });
    return points;
  }, [
    ride.last_driver_lat,
    ride.last_driver_lng,
    ride.dropoff_lat,
    ride.dropoff_lng,
    ride.updated_at,
  ]);

  const runAdvance = async (status: RideRequestRow['status'], reason?: string) => {
    setAdvancing(true);
    try {
      await onAdvance(status, reason);
      setCancelOpen(false);
      setMoreOpen(false);
    } finally {
      setAdvancing(false);
    }
  };

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [moreOpen]);

  useEffect(() => {
    if (!cancelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCancelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelOpen]);

  const navTarget = {
    lat: ride.dropoff_lat,
    lng: ride.dropoff_lng,
    address: ride.dropoff_address,
  };

  return (
    <DriverRideChatWrap ride={ride}>
      {(openChat) => (
    <div className="relative flex h-full min-h-0 flex-col bg-[#f7f9fb] dark:bg-slate-950">
      <div className="relative h-[46vh] min-h-[220px] shrink-0">
        <div className="en-route-map-tiles absolute inset-0">
          <LeafletMap
            height="100%"
            routeColor="#00C4B4"
            route={mapRoute.length > 1 ? mapRoute : []}
            startMarker={
              mapRoute.length > 0
                ? { lat: mapRoute[0].lat, lon: mapRoute[0].lon }
                : { lat: ride.dropoff_lat, lon: ride.dropoff_lng }
            }
            endMarker={{ lat: ride.dropoff_lat, lon: ride.dropoff_lng }}
          />
        </div>
        <div className="en-route-map-gradient pointer-events-none absolute inset-0" aria-hidden />

        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-white/10 bg-slate-800/85 px-5 py-3 shadow-2xl backdrop-blur-lg">
            <Navigation className="h-5 w-5 shrink-0 text-blue-200" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-white">{navTitle}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-200/90">{navSub}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 -mt-8 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-[32px] bg-white pb-4 shadow-[0_-10px_40px_rgba(0,0,0,0.08)] dark:bg-slate-900">
        <div className="mx-auto mb-4 mt-2 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />

        <div className="space-y-6 px-5">
          {trackingError ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {trackingError}
            </p>
          ) : null}

          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-4">
              <div className="relative shrink-0">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-blue-100 shadow-md dark:border-slate-800 dark:bg-blue-950/50">
                  <User className="h-7 w-7 text-blue-700 dark:text-blue-300" aria-hidden />
                </div>
                <span className="absolute -bottom-1 -right-1 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                  —
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-slate-900 dark:text-white">Passenger</h2>
                <div className="flex items-start gap-1 text-slate-500 dark:text-slate-400">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span className="text-sm leading-snug">{dropoffAddress}</span>
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              {tripMins != null ? (
                <p className="text-xl font-semibold text-[#004ac6] dark:text-blue-400">
                  {tripMins}{' '}
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400">mins</span>
                </p>
              ) : null}
              {tripMiles ? (
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {tripMiles}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => openExternalNavigation(navTarget)}
              className="flex flex-col items-center gap-2 transition-transform active:scale-90"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200/90 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Navigation className="h-7 w-7" aria-hidden />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Navigate</span>
            </button>
            <button
              type="button"
              onClick={openChat}
              className="flex flex-col items-center gap-2 transition-transform active:scale-90"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200/90 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <MessageCircle className="h-7 w-7" aria-hidden />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Message</span>
            </button>
            <button
              type="button"
              onClick={() => toast.message('Safety toolkit coming soon')}
              className="flex flex-col items-center gap-2 transition-transform active:scale-90"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                <ShieldAlert className="h-7 w-7" aria-hidden />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
                Safety
              </span>
            </button>
            <div className="relative flex flex-col items-center gap-2" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className="flex flex-col items-center gap-2 transition-transform active:scale-90"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200/90 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <MoreHorizontal className="h-7 w-7" aria-hidden />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">More</span>
              </button>
              {moreOpen ? (
                <div
                  role="menu"
                  className="absolute bottom-full left-1/2 z-30 mb-2 w-44 -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full px-4 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    onClick={() => {
                      setMoreOpen(false);
                      setCancelOpen(true);
                    }}
                  >
                    Cancel ride
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {completeReady ? (
            <button
              type="button"
              disabled={advancing}
              onClick={() => void runAdvance('completed')}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#2DD4BF] py-5 text-lg font-bold text-white shadow-lg shadow-[#2DD4BF]/20 transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {advancing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Completing…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                  Complete trip
                </>
              )}
            </button>
          ) : (
            <p className="rounded-2xl bg-slate-100 px-4 py-4 text-center text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {nearDropoff
                ? 'Hold at the drop-off — Complete trip unlocks once you are inside the destination zone.'
                : 'Complete trip appears when you reach the drop-off location.'}
            </p>
          )}
        </div>
      </div>

      <RideCancelSheet
        open={cancelOpen}
        cancelReason={cancelReason}
        advancing={advancing}
        onReasonChange={setCancelReason}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void runAdvance('cancelled', cancelReason)}
      />
    </div>
      )}
    </DriverRideChatWrap>
  );
}
