import React from 'react';
import { ChevronRight, MapPin } from 'lucide-react';
import type { ActivityTripHistoryItem } from '@roam/types/rides';
import { formatShortAddress } from '@/lib/formatRideAddress';
import { bookerVisibleAddress } from '@/lib/shadowBookerPrivacy';
import { OPEN_ROAM_LABEL, SHADOW_ROAM_LABEL } from '@/lib/tripIntentCopy';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
} from '@/lib/passengerTheme';

function statusLabel(status: ActivityTripHistoryItem['status']): string {
  return status === 'completed' ? 'Completed' : 'Cancelled';
}

function formatEndedAt(endedAt: string): string {
  const date = new Date(endedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function tripTitle(trip: ActivityTripHistoryItem): string {
  if (trip.roam_mode === 'shadow_roam' && trip.participant_role === 'booker') {
    return SHADOW_ROAM_LABEL;
  }

  if (trip.trip_category === 'for_others') {
    const name = trip.counterparty_name?.trim();
    return name ? `Ride for ${name}` : 'Booked for someone';
  }
  if (trip.trip_category === 'for_me') {
    const name = trip.counterparty_name?.trim();
    return name ? `Ride with ${name}` : 'Ride booked for you';
  }
  return trip.roam_mode === 'shadow_roam' ? SHADOW_ROAM_LABEL : OPEN_ROAM_LABEL;
}

function routeDetail(trip: ActivityTripHistoryItem): string | null {
  const pickup = bookerVisibleAddress(
    trip.roam_mode,
    trip.participant_role,
    trip.pickup_address,
  );
  const dropoff = bookerVisibleAddress(
    trip.roam_mode,
    trip.participant_role,
    trip.dropoff_address,
  );
  if (!pickup && !dropoff) return null;
  const from = formatShortAddress(pickup);
  const to = formatShortAddress(dropoff);
  if (from === 'Pickup location' && to === 'Pickup location') return null;
  return `${from} → ${to}`;
}

type ActivityTripRowProps = {
  trip: ActivityTripHistoryItem;
  onOpen: (trip: ActivityTripHistoryItem) => void;
};

export function ActivityTripRow({ trip, onOpen }: ActivityTripRowProps) {
  const title = tripTitle(trip);
  const subtitle = `${statusLabel(trip.status)} · ${formatEndedAt(trip.ended_at)}`;
  const detail = routeDetail(trip);
  const ariaLabel = `${title}, ${subtitle}${detail ? `, ${detail}` : ''}`;

  return (
    <button
      type="button"
      onClick={() => onOpen(trip)}
      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left touch-manipulation transition-colors active:bg-black/[0.03]"
      aria-label={ariaLabel}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: ON_SURFACE }}>
          {title}
        </p>
        <p className="mt-0.5 truncate text-[12px]" style={{ color: PRIMARY }}>
          {subtitle}
        </p>
        {detail ? (
          <p className="mt-1 flex items-center gap-1 truncate text-[11px]" style={{ color: ON_SURFACE_VARIANT }}>
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            {detail}
          </p>
        ) : null}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: OUTLINE_VARIANT }} aria-hidden />
    </button>
  );
}
