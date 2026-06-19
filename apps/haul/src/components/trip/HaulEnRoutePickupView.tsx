import React, { useMemo, useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import type { HaulageBookingManifest } from '@roam/types/haulage';
import { HaulMapBackdrop } from './HaulMapBackdrop';
import { HaulSlideConfirm } from './HaulSlideConfirm';
import {
  formatRideKm,
  formatRideMinutes,
  haulCustomerName,
  haulJobRef,
  splitAddress,
} from '../../utils/haulRideFormat';
import {
  distanceToPickupM,
  formatDistanceMeters,
  pickupNavInstruction,
} from '../../utils/haulRideGeofence';
import { useHaulTripUi } from '../../contexts/HaulTripUiContext';

type Props = {
  ride: RideRequestRow;
  onAdvance: (
    status: RideRequestRow['status'],
    reason?: string,
    verificationPin?: string,
  ) => Promise<void>;
  distanceToPickupMeters?: number | null;
};

function formatWeight(manifest: HaulageBookingManifest | null | undefined): string {
  if (!manifest?.total_weight_kg) return '—';
  const lbs = Math.round(manifest.total_weight_kg * 2.20462);
  return `${lbs.toLocaleString()} lbs`;
}

function formatEquipment(manifest: HaulageBookingManifest | null | undefined): string {
  if (!manifest) return 'Standard';
  if (manifest.recommended_gear?.length) {
    return manifest.recommended_gear[0].replace(/_/g, ' ');
  }
  if (manifest.min_body_type_slug) {
    return manifest.min_body_type_slug.replace(/_/g, ' ');
  }
  return 'Standard';
}

export function HaulEnRoutePickupView({ ride, onAdvance, distanceToPickupMeters }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const { openNavigationPicker } = useHaulTripUi();
  const customer = haulCustomerName(ride);
  const pickup = splitAddress(ride.pickup_address);
  const manifest = ride.haulage_manifest;
  const distM = distanceToPickupMeters ?? distanceToPickupM(ride);

  const navLine = useMemo(() => pickupNavInstruction(ride.pickup_address), [ride.pickup_address]);

  const handleArrived = async () => {
    setAdvancing(true);
    try {
      await onAdvance('driver_arrived_pickup');
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="fixed top-0 left-0 z-40 w-full px-4 pt-4">
        <div className="flex items-center rounded-xl border border-[#534434] bg-[#222a3d]/90 p-4 shadow-lg backdrop-blur-md">
          <div className="mr-4 flex items-center justify-center rounded-lg bg-[#2d3449] p-2">
            <span className="material-symbols-outlined text-[32px] text-[#ffc174]" style={{ fontVariationSettings: "'FILL' 1" }}>
              turn_right
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-medium tracking-widest text-[#d8c3ad] uppercase">Next Action</p>
            <p className="truncate text-lg font-semibold text-[#dae2fd]">{navLine}</p>
          </div>
          <div className="ml-4 border-l border-[#534434] pl-4 text-right">
            <p className="text-2xl font-bold text-[#ffc174]">{formatDistanceMeters(distM)}</p>
          </div>
        </div>
      </div>

      <HaulMapBackdrop variant="grid" interactive>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <path
            d="M 100 800 Q 200 600, 300 400 T 500 200"
            fill="none"
            stroke="#ffc174"
            strokeDasharray="10 10"
            strokeWidth="6"
            opacity="0.6"
          />
          <circle cx="100" cy="800" r="12" fill="#222a3d" stroke="#ffc174" strokeWidth="4" />
          <circle cx="100" cy="800" r="6" fill="#ffc174" />
          <circle cx="500" cy="200" r="16" fill="#f59e0b" />
          <circle cx="500" cy="200" r="6" fill="#613b00" />
        </svg>
      </HaulMapBackdrop>

      <div className="pointer-events-none fixed top-[120px] right-4 left-4 z-30">
        <div className="pointer-events-auto rounded-xl border border-[#534434] bg-[#171f33]/90 p-4 shadow-lg backdrop-blur-md">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <span className="mb-2 inline-block rounded border border-[#ffc174]/30 bg-[#ffc174]/20 px-2 py-1 text-xs font-medium tracking-widest text-[#ffc174] uppercase">
                En route to pickup
              </span>
              <h2 className="text-lg font-semibold text-[#dae2fd]">{customer}</h2>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-[#ffc174]">{formatRideMinutes(ride.duration_estimate_minutes)}</p>
              <p className="text-sm text-[#d8c3ad]">{formatRideKm(ride.distance_estimate_km)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 border-t border-[#534434] pt-2">
            <span className="material-symbols-outlined mt-0.5 text-[#d8c3ad]" style={{ fontVariationSettings: "'FILL' 1" }}>
              location_on
            </span>
            <div>
              <p className="text-[#dae2fd]">{pickup.line1}</p>
              {pickup.line2 ? <p className="text-sm text-[#d8c3ad]">{pickup.line2}</p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 z-40 w-full px-4 pb-4">
        <div className="mb-4">
          <HaulSlideConfirm label="Slide when Arrived" disabled={advancing} onConfirm={() => void handleArrived()} />
        </div>
        <div className="rounded-xl border border-[#534434] bg-[#171f33] shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-10 rounded-full bg-[#534434]" />
          </div>
          <div className="p-4 pt-0">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#dae2fd]">Job Summary</h3>
              <span className="text-sm text-[#d8c3ad]">{haulJobRef(ride)}</span>
            </div>
            <div className="mb-4 flex gap-4">
              <div className="flex-1 rounded-lg border border-[#534434] bg-[#222a3d] p-2">
                <p className="mb-1 text-sm text-[#d8c3ad]">Weight</p>
                <p className="font-semibold text-[#dae2fd]">{formatWeight(manifest)}</p>
              </div>
              <div className="flex-1 rounded-lg border border-[#534434] bg-[#222a3d] p-2">
                <p className="mb-1 text-sm text-[#d8c3ad]">Equipment</p>
                <p className="font-semibold text-[#dae2fd]">{formatEquipment(manifest)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                openNavigationPicker({
                  address: ride.pickup_address ?? pickup.line1,
                  lat: ride.pickup_lat,
                  lng: ride.pickup_lng,
                  label: 'Navigate to Pickup',
                })
              }
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#ffc174]/50 bg-[#2d3449] text-lg font-semibold text-[#ffc174] transition-colors hover:bg-[#2d3449]/80"
            >
              <span className="material-symbols-outlined">navigation</span>
              Navigate in Maps
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
