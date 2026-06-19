import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { isDriverActiveRideStatus } from '@roam/types/rides';
import type { DriverOfferWithRide } from '@roam/types/rides';
import { useRideDispatchContext } from '@roam/driver-internals/contexts/RideDispatchContext';
import { useAppImmersiveMode } from '../../hooks/useAppImmersiveMode';
import {
  customerDisplayName,
  formatHaulDistanceKm,
  formatHaulPayout,
  manifestItemCount,
  offerSecondsRemaining,
  offerTotalSeconds,
} from '../../utils/haulDispatchFormat';
import { HaulFreightManifestSheet } from './HaulFreightManifestSheet';

const TIMER_R = 46;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_R;

type OfferViewProps = {
  offer: DriverOfferWithRide;
  queueHint: string | null;
  onViewManifest: () => void;
  onAccept: () => void;
  onDecline: () => void;
  accepting: boolean;
};

function HaulFreightRequestCard({
  offer,
  queueHint,
  onViewManifest,
  onAccept,
  onDecline,
  accepting,
}: OfferViewProps) {
  const [secondsLeft, setSecondsLeft] = useState(() => offerSecondsRemaining(offer.expires_at));
  const totalSeconds = useMemo(() => offerTotalSeconds(offer), [offer.created_at, offer.expires_at]);
  const expired = secondsLeft <= 0;
  const ride = offer.ride;
  const payout = formatHaulPayout(offer);
  const distanceKm = formatHaulDistanceKm(offer.distance_km);
  const durationMin = ride?.duration_estimate_minutes ?? '—';
  const itemCount = manifestItemCount(offer) || '—';
  const hasManifest = Boolean(ride?.haulage_manifest?.lines?.length);

  useEffect(() => {
    setSecondsLeft(offerSecondsRemaining(offer.expires_at));
    const t = window.setInterval(() => setSecondsLeft(offerSecondsRemaining(offer.expires_at)), 250);
    return () => window.clearInterval(t);
  }, [offer.expires_at, offer.id]);

  const strokeOffset = TIMER_CIRCUMFERENCE * (1 - (expired ? 0 : secondsLeft / totalSeconds));

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0b1326]/80 p-4 backdrop-blur-xl safe-x safe-b">
      <div className="mb-6 w-full max-w-md text-center">
        <div className="haul-pulse-ring mb-2 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#f59e0b] text-[#472a00]">
          <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            local_shipping
          </span>
        </div>
        <h1 className="mb-1 text-xl font-bold tracking-wider text-[#ffc174] uppercase">New Freight Request</h1>
        <p className="text-base text-[#d8c3ad]">High priority haul available nearby.</p>
        {queueHint ? <p className="mt-1 text-xs text-[#d8c3ad]/70">{queueHint}</p> : null}
      </div>

      <div className="relative mb-8 flex w-full max-w-md flex-col items-center">
        <div className="relative mb-6 flex h-48 w-48 items-center justify-center">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={TIMER_R}
              fill="transparent"
              stroke="#2d3449"
              strokeWidth="4"
            />
            <circle
              className="haul-countdown-circle text-[#ffc174]"
              cx="50"
              cy="50"
              r={TIMER_R}
              fill="transparent"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={TIMER_CIRCUMFERENCE}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full border border-[#534434] bg-[#060e20]/50 backdrop-blur-sm">
            <span className="text-[48px] leading-none font-extrabold text-[#dae2fd]">{expired ? '0' : secondsLeft}</span>
            <span className="text-sm font-medium tracking-wide text-[#d8c3ad] uppercase">Seconds</span>
          </div>
        </div>

        <div className="w-full rounded-xl border border-[#534434] bg-[#171f33] p-4 text-center shadow-lg">
          <div className="mb-1 text-sm font-medium tracking-widest text-[#d8c3ad] uppercase">Estimated Payout</div>
          <div className="text-[48px] leading-none font-extrabold text-[#ffc174]">{payout}</div>
        </div>
      </div>

      <div className="mb-8 flex w-full max-w-md justify-between rounded-xl border border-[#534434] bg-[#171f33] p-4 shadow-lg">
        <div className="flex flex-1 flex-col items-center border-r border-[#534434] p-2 text-center">
          <span className="material-symbols-outlined mb-1 text-[#7bd0ff]">my_location</span>
          <span className="text-2xl font-bold text-[#dae2fd]">{distanceKm}</span>
          <span className="text-sm text-[#d8c3ad] uppercase">km away</span>
        </div>
        <div className="flex flex-1 flex-col items-center border-r border-[#534434] p-2 text-center">
          <span className="material-symbols-outlined mb-1 text-[#56e5a9]">schedule</span>
          <span className="text-2xl font-bold text-[#dae2fd]">~{durationMin}</span>
          <span className="text-sm text-[#d8c3ad] uppercase">min total</span>
        </div>
        <div className="flex flex-1 flex-col items-center p-2 text-center">
          <div className="mb-1 flex gap-1 text-[#d8c3ad]">
            <span className="material-symbols-outlined text-sm">chair</span>
            <span className="material-symbols-outlined text-sm">kitchen</span>
          </div>
          <span className="text-2xl font-bold text-[#dae2fd]">{itemCount}</span>
          <span className="text-sm text-[#d8c3ad] uppercase">Items</span>
        </div>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        {hasManifest ? (
          <button
            type="button"
            onClick={onViewManifest}
            className="flex h-12 w-full items-center justify-center rounded-lg border border-[#534434] text-sm font-medium text-[#ffc174] hover:bg-[#171f33]"
          >
            View freight manifest
          </button>
        ) : null}
        <button
          type="button"
          disabled={expired || accepting}
          onClick={onAccept}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-[#ffc174] text-lg font-semibold text-[#472a00] transition-colors hover:bg-[#ffb95f] active:scale-95 disabled:opacity-50"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            check_circle
          </span>
          Accept Request
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-lg border border-[#534434] text-lg font-semibold text-[#d8c3ad] transition-colors hover:bg-[#222a3d] hover:text-[#dae2fd] active:scale-95"
        >
          <span className="material-symbols-outlined">cancel</span>
          Decline
        </button>
      </div>
    </div>
  );
}

export function HaulFreightRequestOverlay() {
  const { online, offers, activeRide, accept, decline } = useRideDispatchContext();
  const [showManifest, setShowManifest] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const showActiveRide = activeRide && isDriverActiveRideStatus(activeRide.status);
  const primaryOffer = online && !showActiveRide && offers.length > 0 ? offers[0] : null;

  useAppImmersiveMode(Boolean(primaryOffer));

  useEffect(() => {
    setShowManifest(false);
    setAccepting(false);
  }, [primaryOffer?.id]);

  if (!primaryOffer) return null;

  const queueHint = offers.length > 1 ? `${offers.length} requests — showing newest` : null;
  const manifest = primaryOffer.ride?.haulage_manifest;

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);
    try {
      await accept(primaryOffer);
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = () => {
    void decline(primaryOffer);
    setShowManifest(false);
  };

  return createPortal(
    <>
      {showManifest && manifest ? (
        <HaulFreightManifestSheet
          customerName={customerDisplayName(primaryOffer)}
          manifest={manifest}
          accepting={accepting}
          onAccept={() => void handleAccept()}
          onDecline={handleDecline}
          onClose={() => setShowManifest(false)}
        />
      ) : (
        <HaulFreightRequestCard
          offer={primaryOffer}
          queueHint={queueHint}
          onViewManifest={() => setShowManifest(true)}
          onAccept={() => void handleAccept()}
          onDecline={handleDecline}
          accepting={accepting}
        />
      )}
    </>,
    document.body,
  );
}
