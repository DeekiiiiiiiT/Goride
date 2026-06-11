import React from 'react';
import { CheckCircle2, MapPin, Radio } from 'lucide-react';
import type { RiderPickupTarget } from '@/lib/riderPickupTarget';
import { PickupLocationRequestStatus } from '@/components/pickup-location/PickupLocationRequestStatus';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type SharedSummary = {
  riderName: string;
  address: string;
  lat: number;
  lng: number;
};

type Props = {
  pendingRequestId: string | null;
  pendingRider: RiderPickupTarget | null;
  sharedSummary: SharedSummary | null;
  onShared: (coords: { lat: number; lng: number; address: string }) => void;
  onPendingCleared: () => void;
  onSharedSummary: (summary: SharedSummary) => void;
  onRestoreShared?: (coords: { lat: number; lng: number; address: string }) => void;
  compact?: boolean;
};

/** Pending / received pickup location activity — shown below Continue on Book for Someone step 1. */
export function PickupLocationActivityPanel({
  pendingRequestId,
  pendingRider,
  sharedSummary,
  onShared,
  onPendingCleared,
  onSharedSummary,
  onRestoreShared,
  compact = false,
}: Props) {
  const showPending = Boolean(pendingRequestId && pendingRider);
  const showShared = Boolean(sharedSummary);

  if (!showPending && !showShared) return null;

  return (
    <section
      className={`space-y-1.5 rounded-[24px] p-4 ${compact ? 'book-for-someone-activity-panel--compact' : ''}`}
      style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
      aria-label="Pickup location requests"
    >
      <div className="flex items-center gap-1.5">
        <Radio className={`shrink-0 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} style={{ color: PRIMARY }} aria-hidden />
        <h3
          className={`font-bold uppercase tracking-wide ${compact ? 'book-for-someone-activity-panel__heading' : 'text-sm'}`}
          style={{ color: ON_SURFACE_VARIANT }}
        >
          Location requests
        </h3>
      </div>

      {showPending && pendingRequestId && pendingRider ? (
        <PickupLocationRequestStatus
          className={compact ? 'book-for-someone-activity-panel__pending' : undefined}
          requestId={pendingRequestId}
          riderName={pendingRider.name}
          riderTarget={pendingRider}
          onShared={({ lat, lng, address }) => {
            onShared({ lat, lng, address });
            onSharedSummary({ riderName: pendingRider.name, address, lat, lng });
            onPendingCleared();
          }}
          onCancelled={onPendingCleared}
          onDeclined={onPendingCleared}
          onExpired={onPendingCleared}
        />
      ) : null}

      {showShared && sharedSummary ? (
        <button
          type="button"
          onClick={() =>
            onRestoreShared?.({
              lat: sharedSummary.lat,
              lng: sharedSummary.lng,
              address: sharedSummary.address,
            })
          }
          className={`btn-touch flex w-full text-left touch-manipulation transition-opacity active:opacity-80 ${
            compact
              ? 'book-for-someone-activity-panel__shared rounded-lg'
              : 'gap-3 rounded-xl px-3.5 py-3'
          }`}
          style={{ backgroundColor: 'rgba(0,109,67,0.08)', border: '1px solid rgba(0,109,67,0.2)' }}
          aria-label={`Restore pickup: ${sharedSummary.address}`}
        >
          <CheckCircle2
            className={`shrink-0 text-emerald-600 ${compact ? 'h-4 w-4' : 'h-5 w-5'}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p
              className={`font-semibold text-emerald-800 ${
                compact ? 'book-for-someone-activity-panel__shared-title' : 'text-sm'
              }`}
            >
              {sharedSummary.riderName} shared their location
            </p>
            <p
              className={`flex items-start gap-1 text-emerald-900/80 ${
                compact ? 'mt-0.5' : 'mt-0.5 gap-1.5 text-sm'
              }`}
            >
              <MapPin className={`shrink-0 ${compact ? 'mt-0.5 h-3 w-3' : 'mt-0.5 h-3.5 w-3.5'}`} aria-hidden />
              <span className={compact ? 'book-for-someone-activity-panel__shared-address' : 'break-words text-sm'}>
                {sharedSummary.address}
              </span>
            </p>
            {!compact ? (
              <p className="mt-1 text-xs font-medium text-emerald-700/80">Tap to restore pickup</p>
            ) : null}
          </div>
        </button>
      ) : null}
    </section>
  );
}
