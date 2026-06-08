import React, { useState } from 'react';
import { Info, Loader2, Lock, X } from 'lucide-react';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { RoamMode, TripIntentBookerViewDto } from '@roam/types/riderContacts';
import { formatRoamTagDisplay } from '@/services/roamTagEdge';
import { formatFareMinor } from '@/services/tripIntentEdge';
import {
  OPEN_ROAM_LABEL,
  ROAM_MODE_TOOLTIPS,
  SHADOW_ROAM_LABEL,
} from '@/lib/tripIntentCopy';
import {
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Props = {
  open: boolean;
  intent: TripIntentBookerViewDto | null;
  loading?: boolean;
  onClose: () => void;
  onFulfill: (intent: TripIntentBookerViewDto) => void;
  onBookDifferent?: () => void;
  showBookDifferent?: boolean;
};

function modeLabel(mode: RoamMode): string {
  return mode === 'shadow_roam' ? SHADOW_ROAM_LABEL : OPEN_ROAM_LABEL;
}

export function TripIntentBookSheet({
  open,
  intent,
  loading,
  onClose,
  onFulfill,
  onBookDifferent,
  showBookDifferent,
}: Props) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  if (!open || !intent) return null;

  const requester = intent.requester;
  const displayName = requester.requester_name ?? requester.first_name;
  const tag = requester.custom_tag_name ? formatRoamTagDisplay(requester.custom_tag_name) : null;
  const vehicle = intent.vehicle_option ? vehicleTypeLabel(intent.vehicle_option) : 'Roam';
  const fare = formatFareMinor(intent.fare_estimate_minor, intent.currency);
  const isShadow = intent.roam_mode === 'shadow_roam';
  const ctaLabel = isShadow ? 'Pay for trip' : 'Book and track';

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 safe-x" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-3xl px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl"
        style={{ backgroundColor: PAGE_BG }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>
            Trip request
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-2" aria-label="Close">
            <X className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {requester.avatar_url ? (
              <img src={requester.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold"
                style={{ backgroundColor: PRIMARY_CONTAINER, color: PRIMARY }}
              >
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold" style={{ color: ON_SURFACE }}>
                {displayName}
              </p>
              {tag ? (
                <p className="text-sm font-medium" style={{ color: PRIMARY }}>
                  {tag}
                </p>
              ) : null}
            </div>
          </div>

          <div
            className="flex items-center justify-between rounded-2xl px-4 py-3"
            style={{ backgroundColor: SURFACE_LOWEST }}
          >
            <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: ON_SURFACE }}>
              {modeLabel(intent.roam_mode)}
              <button
                type="button"
                onClick={() => setTooltipOpen((v) => !v)}
                aria-label="What does this trip type mean?"
              >
                <Info className="h-4 w-4" style={{ color: ON_SURFACE_VARIANT }} />
              </button>
            </span>
            <span className="text-lg font-bold" style={{ color: ON_SURFACE }}>
              {fare}
            </span>
          </div>

          {tooltipOpen ? (
            <p className="rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_SURFACE }}>
              {ROAM_MODE_TOOLTIPS[intent.roam_mode]}
            </p>
          ) : null}

          <div className="flex items-center justify-between text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            <span>{vehicle}</span>
            {intent.has_route ? (
              <span className="flex items-center gap-1">
                {isShadow ? <Lock className="h-4 w-4" aria-hidden /> : null}
                {isShadow ? 'Locations private' : 'Route set'}
              </span>
            ) : (
              <span>Route not set yet</span>
            )}
          </div>

          {!intent.can_fulfill && intent.block_reason ? (
            <p className="text-sm text-red-600" role="alert">
              {intent.block_reason === 'not_targeted'
                ? 'This trip is for someone else.'
                : 'This trip is not available.'}
            </p>
          ) : null}

          <button
            type="button"
            disabled={loading || !intent.can_fulfill}
            onClick={() => onFulfill(intent)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-semibold disabled:opacity-50"
            style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : ctaLabel}
          </button>

          {showBookDifferent && onBookDifferent ? (
            <button
              type="button"
              onClick={onBookDifferent}
              className="w-full py-2 text-sm font-medium"
              style={{ color: PRIMARY }}
            >
              Book a different trip
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
