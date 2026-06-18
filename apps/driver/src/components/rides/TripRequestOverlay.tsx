import React, { useEffect, useMemo, useState } from 'react';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { DriverOfferWithRide } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { ChevronRight, Circle, Loader2, Luggage, MapPin, Star, User } from 'lucide-react';
import { cn } from '@roam/ui';
import {
  estimatePickupMinutes,
  formatOfferDistanceMi,
  offerSecondsRemaining,
} from './rideDispatchUtils';
import { useDispatchConfig } from '@roam/hauler-dispatch';
import { HaulageManifestCard } from './HaulageManifestCard';

const TIMER_RADIUS = 36;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;

type Props = {
  offer: DriverOfferWithRide;
  queueHint?: string | null;
  onAccept: (offer: DriverOfferWithRide) => void | Promise<void>;
  onDecline: (offer: DriverOfferWithRide) => void | Promise<void>;
};

function formatFareDisplay(minor: number, currency: string): string {
  return formatMoneyMinor(minor, currency).replace(/^[A-Z]{3}\s+/i, '').trim();
}

function offerWindowSeconds(offer: DriverOfferWithRide): number {
  const created = new Date(offer.created_at).getTime();
  const expires = new Date(offer.expires_at).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created) return 15;
  return Math.max(1, Math.ceil((expires - created) / 1000));
}

export function TripRequestOverlay({ offer, queueHint, onAccept, onDecline }: Props) {
  const dispatchConfig = useDispatchConfig();
  const [secondsLeft, setSecondsLeft] = useState(() => offerSecondsRemaining(offer.expires_at));
  const [accepting, setAccepting] = useState(false);
  const totalSeconds = useMemo(() => offerWindowSeconds(offer), [offer.created_at, offer.expires_at]);

  useEffect(() => {
    setSecondsLeft(offerSecondsRemaining(offer.expires_at));
    const t = window.setInterval(() => {
      setSecondsLeft(offerSecondsRemaining(offer.expires_at));
    }, 250);
    return () => clearInterval(t);
  }, [offer.expires_at, offer.id]);

  const expired = secondsLeft <= 0;
  const ride = offer.ride;
  const fare =
    ride != null ? formatFareDisplay(ride.fare_estimate_minor, ride.currency ?? 'JMD') : '—';

  const pickupMins = estimatePickupMinutes(offer.distance_km);
  const pickupLabel =
    pickupMins != null ? `Pickup • ${pickupMins} min${pickupMins === 1 ? '' : 's'} away` : 'Pickup';

  const tripMins = ride?.duration_estimate_minutes;
  const tripLabel =
    tripMins != null
      ? `Drop-off • ${tripMins} min${tripMins === 1 ? '' : 's'} trip`
      : 'Drop-off';

  const timerProgress = expired ? 0 : Math.min(1, secondsLeft / totalSeconds);
  const strokeDashoffset = TIMER_CIRCUMFERENCE * (1 - timerProgress);
  const serviceLabel = ride ? vehicleTypeLabel(ride.vehicle_option) : 'Ride';

  const handleAccept = async () => {
    if (expired || accepting) return;
    setAccepting(true);
    try {
      await onAccept(offer);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" aria-hidden />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-request-title"
        className="fixed bottom-0 left-0 right-0 z-[210] mx-auto flex max-w-xl flex-col gap-6 rounded-t-2xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] shadow-2xl safe-x dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              New request
            </span>
            <h1
              id="trip-request-title"
              className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white"
            >
              {fare}
            </h1>
            {ride != null && ride.surge_multiplier > 1 ? (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Surge ×{ride.surge_multiplier.toFixed(2)}
              </p>
            ) : null}
            {queueHint ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{queueHint}</p>
            ) : null}
          </div>

          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
            {!expired ? <div className="trip-request-overlay__timer-pulse absolute inset-0" aria-hidden /> : null}
            <svg
              className="trip-request-overlay__timer-svg h-full w-full"
              viewBox="0 0 80 80"
              aria-hidden
            >
              <circle
                className="text-slate-200 dark:text-slate-700"
                cx="40"
                cy="40"
                r={TIMER_RADIUS}
                fill="transparent"
                stroke="currentColor"
                strokeWidth="4"
              />
              <circle
                className={cn('text-[#2DD4BF] transition-[stroke-dashoffset] duration-300 ease-linear', expired && 'opacity-40')}
                cx="40"
                cy="40"
                r={TIMER_RADIUS}
                fill="transparent"
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray={TIMER_CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-xl font-semibold tabular-nums text-slate-900 dark:text-white" aria-live="polite">
              {expired ? '—' : secondsLeft}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <Circle className="h-5 w-5 fill-[#004ac6] text-[#004ac6]" aria-hidden />
              <div className="my-1 h-8 w-0 border-l-2 border-dotted border-slate-300 dark:border-slate-600" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 flex-col">
              <span className="text-sm text-slate-500 dark:text-slate-400">{pickupLabel}</span>
              <p className="text-base font-semibold text-slate-900 dark:text-white">
                {ride?.pickup_address?.trim() || 'Pickup location'}
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <MapPin className="h-5 w-5 shrink-0 text-red-600" fill="currentColor" aria-hidden />
            <div className="min-w-0 flex-1 flex-col">
              <span className="text-sm text-slate-500 dark:text-slate-400">{tripLabel}</span>
              <p className="text-base font-semibold text-slate-900 dark:text-white">
                {ride?.dropoff_address?.trim() || 'Drop-off location'}
              </p>
            </div>
          </div>

          {dispatchConfig.dispatchMode === 'haulage' && ride?.haulage_manifest ? (
            <HaulageManifestCard manifest={ride.haulage_manifest} compact />
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 shadow-sm dark:bg-slate-700">
              <User className="h-6 w-6 text-slate-500 dark:text-slate-400" aria-hidden />
            </div>
            <div className="min-w-0 flex flex-col">
              <span className="truncate text-base font-bold text-slate-900 dark:text-white">Passenger</span>
              <div className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden />
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Rider trip
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-3 py-1 dark:bg-blue-950/40">
            <Luggage className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" aria-hidden />
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{serviceLabel}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 pb-2">
          {expired ? (
            <p className="text-center text-sm font-medium text-slate-500">Offer expired</p>
          ) : null}
          <button
            type="button"
            disabled={expired || accepting}
            onClick={() => void handleAccept()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2DD4BF] py-4 text-lg font-semibold uppercase tracking-wider text-slate-900 shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {accepting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Connecting…
              </>
            ) : (
              <>
                Accept
                <ChevronRight className="h-5 w-5" aria-hidden />
              </>
            )}
          </button>
          <button
            type="button"
            disabled={expired || accepting}
            onClick={() => void onDecline(offer)}
            className="w-full rounded-2xl bg-slate-100 py-4 text-base font-medium text-slate-600 transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
          >
            Decline
          </button>
        </div>
      </section>
    </>
  );
}
