import React, { useEffect, useState } from 'react';
import type { DriverOfferWithRide } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { offerSecondsRemaining } from './rideDispatchUtils';

interface RideOfferCardProps {
  offer: DriverOfferWithRide;
  onAccept: (offer: DriverOfferWithRide) => void;
  onDecline: (offer: DriverOfferWithRide) => void;
  compact?: boolean;
}

export function RideOfferCard({ offer, onAccept, onDecline, compact = false }: RideOfferCardProps) {
  const [secondsLeft, setSecondsLeft] = useState(() => offerSecondsRemaining(offer.expires_at));

  useEffect(() => {
    setSecondsLeft(offerSecondsRemaining(offer.expires_at));
    const t = window.setInterval(() => {
      const next = offerSecondsRemaining(offer.expires_at);
      setSecondsLeft(next);
      if (next <= 0) window.clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [offer.expires_at, offer.id]);

  const expired = secondsLeft <= 0;
  const progress = expired ? 0 : Math.min(100, (secondsLeft / 15) * 100);

  return (
    <li
      className={`rounded-2xl border bg-white dark:bg-slate-900 flex flex-col gap-2 ${
        compact
          ? 'border-slate-200/80 dark:border-slate-700/80 p-3'
          : 'border-slate-200 dark:border-slate-800 p-4'
      } ${expired ? 'opacity-60' : ''}`}
    >
      <div className="space-y-2">
        <OfferCountdownHeader secondsLeft={secondsLeft} expired={expired} compact={compact} />
        <div className="h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${expired ? 'bg-slate-400' : 'bg-emerald-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className={`text-slate-500 space-y-1 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        <p>
          Wave {offer.wave} · {offer.distance_km != null ? `${offer.distance_km.toFixed(2)} km to pickup` : '—'}
        </p>
        {offer.ride && (
          <>
            <p className="text-slate-700 dark:text-slate-200 font-medium truncate">
              {offer.ride.pickup_address ?? 'Pickup'} → {offer.ride.dropoff_address ?? 'Drop-off'}
            </p>
            <p
              className={`font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums ${
                compact ? 'text-xs' : 'text-sm'
              }`}
            >
              {formatMoneyMinor(offer.ride.fare_estimate_minor, offer.ride.currency ?? 'JMD')}
              {offer.ride.surge_multiplier > 1 ? (
                <span className="text-amber-700 dark:text-amber-400 font-normal ml-1">
                  · surge ×{offer.ride.surge_multiplier.toFixed(2)}
                </span>
              ) : null}
            </p>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={expired}
          className={`flex-1 rounded-xl bg-emerald-600 text-white font-medium disabled:opacity-40 ${
            compact ? 'py-2 text-xs' : 'py-2.5 text-sm'
          }`}
          onClick={() => onAccept(offer)}
        >
          Accept
        </button>
        <button
          type="button"
          disabled={expired}
          className={`flex-1 rounded-xl border border-slate-300 dark:border-slate-600 disabled:opacity-40 ${
            compact ? 'py-2 text-xs' : 'py-2.5 text-sm'
          }`}
          onClick={() => onDecline(offer)}
        >
          Decline
        </button>
      </div>
    </li>
  );
}

function OfferCountdownHeader({
  secondsLeft,
  expired,
  compact,
}: {
  secondsLeft: number;
  expired: boolean;
  compact: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={`font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 ${
          compact ? 'text-[10px]' : 'text-xs'
        }`}
      >
        {expired ? 'Offer expired' : 'Incoming ride'}
      </span>
      {!expired && (
        <span
          className={`tabular-nums font-medium text-slate-600 dark:text-slate-300 ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {secondsLeft}s
        </span>
      )}
    </div>
  );
}
