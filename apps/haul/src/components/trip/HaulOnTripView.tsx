import React, { useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { HAUL_MAP_BG_DELIVERING, HaulMapBackdrop } from './HaulMapBackdrop';
import { formatRideKm, formatRideMinutes, splitAddress } from '../../utils/haulRideFormat';
import { canCompleteTrip } from '../../utils/haulRideGeofence';
import { useHaulTripUi } from '../../contexts/HaulTripUiContext';

type Props = {
  ride: RideRequestRow;
  onAdvance: (
    status: RideRequestRow['status'],
    reason?: string,
    verificationPin?: string,
  ) => Promise<void>;
};

function shouldCollectCash(ride: RideRequestRow): boolean {
  return ride.payment_method === 'cash';
}

export function HaulOnTripView({ ride, onAdvance }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const { openReportIssue, openNavigationPicker } = useHaulTripUi();
  const dropoff = splitAddress(ride.dropoff_address);
  const completeReady = canCompleteTrip(ride);
  const useCash = shouldCollectCash(ride);

  const handleDropoff = async () => {
    setAdvancing(true);
    try {
      await onAdvance(useCash ? 'awaiting_cash_settlement' : 'completed');
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="relative z-50 flex h-11 shrink-0 items-center justify-between border-b border-[#534434] bg-[#0b1326]/80 px-4 backdrop-blur-md">
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full text-[#d8c3ad] hover:bg-[#2d3449]/50" aria-label="Back">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="text-xl font-black tracking-[0.2em] text-[#ffc174] uppercase">Roam Haul</div>
        <div className="h-11 w-11" />
      </header>

      <main className="relative min-h-0 flex-1">
        <HaulMapBackdrop variant="image" imageUrl={HAUL_MAP_BG_DELIVERING} interactive>
          <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            <div className="haul-pulse-ring absolute h-12 w-12 rounded-full bg-[#ffc174]" />
            <div className="relative z-10 h-6 w-6 rounded-full border-2 border-[#0b1326] bg-[#ffc174] shadow-[0_0_10px_rgba(255,193,116,0.5)]" />
            <span
              className="material-symbols-outlined absolute z-20 text-sm text-[#472a00]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              local_shipping
            </span>
          </div>
        </HaulMapBackdrop>

        <div className="absolute top-2 right-0 left-0 z-40 px-4">
          <div className="rounded-xl border border-[#534434] bg-[#222a3d] p-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="mb-1 flex items-center gap-1 text-xs font-medium tracking-widest text-[#56e5a9] uppercase">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#56e5a9]" />
                  Delivering to
                </span>
                <h2 className="text-lg font-semibold text-[#dae2fd]">
                  {dropoff.line1}
                  {dropoff.line2 ? `, ${dropoff.line2}` : ''}
                </h2>
              </div>
              <div className="text-right">
                <span className="text-sm text-[#d8c3ad]">ETA</span>
                <p className="text-2xl font-bold text-[#ffc174]">{formatRideMinutes(ride.duration_estimate_minutes)}</p>
                <p className="text-sm text-[#d8c3ad]">({formatRideKm(ride.distance_estimate_km)})</p>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute right-4 bottom-[180px] z-40 flex flex-col gap-3">
          <button
            type="button"
            onClick={() =>
              openNavigationPicker({
                address: ride.dropoff_address ?? dropoff.line1,
                lat: ride.dropoff_lat,
                lng: ride.dropoff_lng,
                label: 'Navigate to Dropoff',
              })
            }
            aria-label="Navigate to dropoff"
            className="flex h-14 w-14 items-center justify-center rounded-full border border-[#ffc174]/30 bg-[#171f33] text-[#ffc174] shadow-lg active:scale-95"
          >
            <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              navigation
            </span>
          </button>
          <button
            type="button"
            onClick={() => openReportIssue(ride)}
            aria-label="Report issue"
            className="flex h-14 w-14 items-center justify-center rounded-full border border-[#ffb4ab]/30 bg-[#93000a] text-[#ffdad6] shadow-lg active:scale-95"
          >
            <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              warning
            </span>
          </button>
        </div>
      </main>

      <div className="relative z-50 shrink-0 rounded-t-xl border-t border-[#534434] bg-[#171f33] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex h-8 items-center justify-center">
          <div className="h-1 w-10 rounded-full bg-[#534434]" />
        </div>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#d8c3ad]">receipt_long</span>
              <span className="text-lg font-semibold text-[#dae2fd]">Manifest summary</span>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-[#7bd0ff]/10 px-2 py-1">
              <span className="material-symbols-outlined text-[16px] text-[#7bd0ff]" style={{ fontVariationSettings: "'FILL' 1" }}>
                visibility
              </span>
              <span className="text-xs text-[#7bd0ff]">Customer tracking active</span>
            </div>
          </div>
          {!completeReady ? (
            <p className="text-center text-xs text-[#d8c3ad]">Arrival confirms when you reach the drop-off zone.</p>
          ) : null}
          <button
            type="button"
            disabled={advancing || !completeReady}
            onClick={() => void handleDropoff()}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-[#ffc174] text-lg font-semibold text-[#472a00] shadow-[0_4px_14px_rgba(255,193,116,0.39)] transition-transform hover:bg-[#ffc174]/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              location_on
            </span>
            {advancing ? 'Updating…' : useCash ? 'Collect payment' : 'Arrived at Dropoff'}
          </button>
        </div>
      </div>
    </div>
  );
}
