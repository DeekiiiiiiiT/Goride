import React from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { useBookerTracking } from '@/contexts/BookerTrackingContext';
import {
  bookerChipStatusLabel,
  BOOKER_CHIP_HEIGHT_PX,
  passengerChipStatusLabel,
} from '@/lib/bookerTracking';
import { PRIMARY, PRIMARY_CONTAINER, ON_PRIMARY, ON_SURFACE, ON_SURFACE_VARIANT } from '@/lib/passengerTheme';

/**
 * Floating chip when booker or rider minimized the live tracker.
 * Refreshes status only on app/tab focus (via BookerTrackingContext).
 */
export function BookerActiveTripChip() {
  const { mode, minimizedRideId, minimizedRole, summary, summaryLoading, openFull } =
    useBookerTracking();

  if (mode !== 'minimized' || !minimizedRideId) return null;

  const isBooker = minimizedRole === 'booker';
  const passengerName = summary?.guest_passenger_name?.trim() || 'Passenger';
  const title = isBooker ? `Ride for ${passengerName}` : 'Your active trip';
  const statusLabel = summary
    ? isBooker
      ? bookerChipStatusLabel(summary.status)
      : passengerChipStatusLabel(summary.status)
    : 'Tap to open trip';

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 z-40 px-4 safe-x"
      style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
      role="region"
      aria-label={title}
    >
      <button
        type="button"
        onClick={() => openFull(minimizedRideId)}
        className="mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-lg touch-manipulation active:scale-[0.99]"
        style={{
          minHeight: BOOKER_CHIP_HEIGHT_PX,
          backgroundColor: PRIMARY_CONTAINER,
          borderColor: 'rgba(0,74,198,0.15)',
          color: ON_SURFACE,
        }}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.9)', color: PRIMARY }}
          aria-hidden
        >
          {summaryLoading && !summary ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Eye className="h-5 w-5" strokeWidth={2} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold" style={{ color: ON_SURFACE }}>
            {title}
          </span>
          <span className="block truncate text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            {statusLabel}
          </span>
        </span>
        <span
          className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold"
          style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
        >
          View
        </span>
      </button>
    </div>
  );
}
