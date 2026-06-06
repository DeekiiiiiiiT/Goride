import React, { useEffect, useState } from 'react';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { DriverOfferWithRide } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { MapPin, Square, User } from 'lucide-react';
import {
  estimatePickupMinutes,
  formatOfferDistanceMi,
  offerSecondsRemaining,
} from './rideDispatchUtils';

interface RideOfferCardProps {
  offer: DriverOfferWithRide;
  onAccept: (offer: DriverOfferWithRide) => void;
  onDecline: (offer: DriverOfferWithRide) => void;
  compact?: boolean;
}

const OFFER_WINDOW_SEC = 15;

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
  const progress = expired ? 0 : Math.min(100, (secondsLeft / OFFER_WINDOW_SEC) * 100);
  const ride = offer.ride;

  const serviceLabel = ride ? vehicleTypeLabel(ride.vehicle_option) : 'Ride';
  const fare =
    ride != null
      ? formatMoneyMinor(ride.fare_estimate_minor, ride.currency ?? 'JMD')
      : '—';

  const pickupMins = estimatePickupMinutes(offer.distance_km);
  const pickupMi = formatOfferDistanceMi(offer.distance_km);
  const pickupMeta =
    pickupMins != null && pickupMi != null
      ? `${pickupMins} min${pickupMins === 1 ? '' : 's'} (${pickupMi}) away`
      : pickupMi != null
        ? `${pickupMi} away`
        : 'Pickup';

  const tripMins = ride?.duration_estimate_minutes;
  const tripMi = formatOfferDistanceMi(ride?.distance_estimate_km);
  const tripMeta =
    tripMins != null && tripMi != null
      ? `${tripMins} min${tripMins === 1 ? '' : 's'} (${tripMi}) trip`
      : tripMi != null
        ? `${tripMi} trip`
        : tripMins != null
          ? `${tripMins} min${tripMins === 1 ? '' : 's'} trip`
          : 'Trip';

  return (
    <li
      className={`ride-offer-card ${compact ? 'ride-offer-card--compact' : ''} ${
        expired ? 'ride-offer-card--expired' : ''
      }`}
    >
      {expired ? <p className="ride-offer-card__expired-label">Offer expired</p> : null}

      <div className="ride-offer-card__service-pill" aria-label={`Service: ${serviceLabel}`}>
        <span className="ride-offer-card__service-main">
          <User className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
          {ride?.guest_passenger_name?.trim()
            ? `${ride.guest_passenger_name.trim()} · ${serviceLabel}`
            : serviceLabel}
        </span>
        <span className="ride-offer-card__service-timer" aria-live="polite">
          {expired ? '—' : `${secondsLeft}s`}
        </span>
      </div>

      <div className="ride-offer-card__fare-block">
        <p className="ride-offer-card__fare">{fare}</p>
        {ride != null && ride.surge_multiplier > 1 ? (
          <p className="ride-offer-card__surge">Surge ×{ride.surge_multiplier.toFixed(2)}</p>
        ) : null}
      </div>

      <div className="ride-offer-card__progress" aria-hidden>
        <div
          className={`ride-offer-card__progress-fill ${expired ? 'ride-offer-card__progress-fill--expired' : ''}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="ride-offer-card__divider" aria-hidden />

      <div className="ride-offer-card__route">
        <div className="ride-offer-card__leg">
          <div className="ride-offer-card__leg-icon-col">
            <MapPin className="ride-offer-card__leg-icon size-4" strokeWidth={2} aria-hidden />
            <span className="ride-offer-card__leg-line" aria-hidden />
          </div>
          <div className="ride-offer-card__leg-body">
            <p className="ride-offer-card__leg-meta">{pickupMeta}</p>
            <p className="ride-offer-card__leg-address">
              {ride?.pickup_address?.trim() || 'Pickup location'}
            </p>
          </div>
        </div>

        <div className="ride-offer-card__leg">
          <div className="ride-offer-card__leg-icon-col">
            <Square className="ride-offer-card__leg-icon size-3.5" strokeWidth={2.25} aria-hidden />
          </div>
          <div className="ride-offer-card__leg-body">
            <p className="ride-offer-card__leg-meta">{tripMeta}</p>
            <p className="ride-offer-card__leg-address">
              {ride?.dropoff_address?.trim() || 'Drop-off location'}
            </p>
          </div>
        </div>
      </div>

      <div className="ride-offer-card__actions">
        <button
          type="button"
          disabled={expired}
          className="ride-offer-card__accept"
          onClick={() => onAccept(offer)}
        >
          Accept
        </button>
        <button
          type="button"
          disabled={expired}
          className="ride-offer-card__decline"
          onClick={() => onDecline(offer)}
        >
          Decline
        </button>
      </div>
    </li>
  );
}
