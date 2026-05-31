import React, { useState } from 'react';
import { Loader2, MapPin, ShieldCheck, Star, User } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import type { RoutePoint } from '../../types/tripSession';
import { LeafletMap } from '../maps/LeafletMap';
import { RiderPinEntry } from './RiderPinEntry';
import { SwipeToStart } from './SwipeToStart';
import { GracePeriodCountdown, isGracePeriodActive } from './GracePeriodCountdown';

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
  waitTimeInfo?: WaitTimeInfo | null;
};

function shortAddress(address: string | null | undefined): string {
  const trimmed = address?.trim();
  if (!trimmed) return 'Pickup location';
  const parts = trimmed.split(',').map((p) => p.trim());
  if (parts.length <= 2) return trimmed;
  return `${parts[0]}, ${parts[parts.length - 2]}`;
}

export function ArrivedPickupPanel({ ride, onAdvance, trackingError, waitTimeInfo }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const pinRequired = Boolean(ride.pin_verification_pending) && !ride.pin_verified_at;
  const graceActive = isGracePeriodActive(waitTimeInfo, ride.wait_time_started_at);

  const mapRoute: RoutePoint[] = [
    {
      lat: ride.last_driver_lat ?? ride.pickup_lat,
      lon: ride.last_driver_lng ?? ride.pickup_lng,
      timestamp: Date.now(),
    },
    { lat: ride.pickup_lat, lon: ride.pickup_lng, timestamp: Date.now() },
  ];

  const handlePinSubmit = async (pin: string) => {
    setPinError(null);
    try {
      await onAdvance('on_trip', undefined, pin);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'PIN verification failed';
      setPinError(msg.includes('mismatch') ? 'Incorrect PIN. Ask the rider to check their app.' : msg);
      throw e;
    }
  };

  const handleStartWithoutPin = async () => {
    setAdvancing(true);
    try {
      await onAdvance('on_trip');
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f9fb] dark:bg-slate-950">
      <div className="relative h-[36vh] min-h-[180px] shrink-0">
        <div className="en-route-map-tiles absolute inset-0">
          <LeafletMap
            height="100%"
            routeColor="#00C4B4"
            route={mapRoute}
            endMarker={{ lat: ride.pickup_lat, lon: ride.pickup_lng }}
          />
        </div>
        <div className="en-route-map-gradient pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-4">
          <div className="rounded-full bg-emerald-600/90 px-5 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-sm">
            Arrived at pickup
          </div>
        </div>
      </div>

      <div className="relative z-10 -mt-8 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-[32px] bg-white px-5 pb-6 pt-8 shadow-[0_-10px_30px_rgba(0,0,0,0.06)] dark:bg-slate-900">
        <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />

        {trackingError ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            {trackingError}
          </p>
        ) : null}

        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/50">
            <User className="h-7 w-7 text-blue-700 dark:text-blue-300" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Passenger</h2>
            <div className="flex items-center gap-1 text-sm text-slate-500">
              <MapPin className="h-4 w-4" aria-hidden />
              {shortAddress(ride.pickup_address)}
            </div>
          </div>
        </div>

        {pinRequired ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                Enter the rider&apos;s PIN to start the trip
              </p>
            </div>
            <RiderPinEntry onSubmit={handlePinSubmit} error={pinError} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-1 text-sm text-slate-500">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              Ready to start trip
            </div>
            <SwipeToStart
              label="Swipe to start trip"
              disabled={advancing}
              onComplete={() => void handleStartWithoutPin()}
            />
            {advancing ? (
              <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Starting…
              </p>
            ) : null}
          </div>
        )}

        {graceActive ? (
          <div className="mt-6">
            <GracePeriodCountdown
              waitTimeInfo={waitTimeInfo}
              graceStartedAt={ride.wait_time_started_at}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
