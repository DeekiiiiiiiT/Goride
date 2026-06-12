import React from 'react';
import type { ActivityTripHistoryItem } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { bookerVisibleAddress } from '@/lib/shadowBookerPrivacy';
import {
  activityTripWhen,
  formatActivityDateTime,
} from '@/lib/activityTripDetailsUtils';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

function statusLabel(status: ActivityTripHistoryItem['status']): string {
  return status === 'completed' ? 'Completed' : 'Cancelled';
}

function formatFare(trip: ActivityTripHistoryItem): string {
  const minor = trip.fare_estimate_minor;
  if (minor == null) return '—';
  return formatMoneyMinor(minor, trip.currency ?? 'JMD').replace(/^[A-Z]{3}\s+/i, '').trim();
}

function fareSizeClass(amount: string): string {
  const len = amount.replace(/\s/g, '').length;
  if (len > 12) return 'text-xs';
  if (len > 9) return 'text-sm';
  return 'text-base';
}

type ActivityTripRowProps = {
  trip: ActivityTripHistoryItem;
  onOpen: (trip: ActivityTripHistoryItem) => void;
};

export function ActivityTripRow({ trip, onOpen }: ActivityTripRowProps) {
  const isCompleted = trip.status === 'completed';
  const fare = formatFare(trip);
  const pickup = bookerVisibleAddress(trip.roam_mode, trip.participant_role, trip.pickup_address);
  const dropoff = bookerVisibleAddress(trip.roam_mode, trip.participant_role, trip.dropoff_address);
  const whenLabel = formatActivityDateTime(activityTripWhen(trip));
  const ariaLabel = `${statusLabel(trip.status)}, ${whenLabel}, ${fare}`;

  return (
    <button
      type="button"
      onClick={() => onOpen(trip)}
      className="w-full rounded-[20px] border p-3.5 text-left touch-manipulation transition-all active:scale-[0.99]"
      style={{
        backgroundColor: SURFACE_LOWEST,
        borderColor: 'var(--home-sheet-border, rgba(188, 202, 190, 0.35))',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
      }}
      aria-label={ariaLabel}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span
            className="mb-1 inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: isCompleted ? 'var(--passenger-primary-container)' : 'var(--passenger-surface-low)',
              color: isCompleted ? PRIMARY : ON_SURFACE_VARIANT,
            }}
          >
            {statusLabel(trip.status)}
          </span>
          <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            {whenLabel}
          </p>
        </div>
        <span
          className={`shrink-0 font-bold tabular-nums leading-tight ${fareSizeClass(fare)}`}
          style={{ color: PRIMARY }}
        >
          {fare}
        </span>
      </div>

      {pickup || dropoff ? (
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-0.5">
            <div
              className="h-3 w-3 rounded-full border-2 bg-white"
              style={{ borderColor: isCompleted ? PRIMARY : ON_SURFACE_VARIANT }}
              aria-hidden
            />
            <div
              className="my-0.5 h-4 w-0.5"
              style={{ backgroundColor: 'var(--passenger-outline-variant)' }}
              aria-hidden
            />
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: isCompleted ? PRIMARY : 'var(--passenger-outline-variant)' }}
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                Pickup
              </p>
              <p className="line-clamp-2 text-xs leading-snug" style={{ color: ON_SURFACE }}>
                {pickup ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                Drop-off
              </p>
              <p className="line-clamp-2 text-xs leading-snug" style={{ color: ON_SURFACE }}>
                {dropoff ?? '—'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
          Trip details available on open
        </p>
      )}
    </button>
  );
}
