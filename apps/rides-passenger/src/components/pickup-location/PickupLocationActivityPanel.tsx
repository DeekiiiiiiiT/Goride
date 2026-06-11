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
};

type Props = {
  pendingRequestId: string | null;
  pendingRider: RiderPickupTarget | null;
  sharedSummary: SharedSummary | null;
  onShared: (coords: { lat: number; lng: number; address: string }) => void;
  onPendingCleared: () => void;
  onSharedSummary: (summary: SharedSummary) => void;
};

/** Pending / received pickup location activity — shown below Continue on Book for Someone step 1. */
export function PickupLocationActivityPanel({
  pendingRequestId,
  pendingRider,
  sharedSummary,
  onShared,
  onPendingCleared,
  onSharedSummary,
}: Props) {
  const showPending = Boolean(pendingRequestId && pendingRider);
  const showShared = Boolean(sharedSummary);
  const showHint = !showPending && !showShared;

  return (
    <section
      className="space-y-2 rounded-[24px] p-4"
      style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
      aria-label="Pickup location requests"
    >
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 shrink-0" style={{ color: PRIMARY }} aria-hidden />
        <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
          Location requests
        </h3>
      </div>

      {showHint ? (
        <p className="text-sm leading-snug" style={{ color: ON_SURFACE_VARIANT }}>
          Tap <strong style={{ color: ON_SURFACE }}>Get rider&apos;s location</strong> above to choose
          someone. They&apos;ll get a text to share their current pickup point.
        </p>
      ) : null}

      {showPending && pendingRequestId && pendingRider ? (
        <PickupLocationRequestStatus
          requestId={pendingRequestId}
          riderName={pendingRider.name}
          riderTarget={pendingRider}
          onShared={({ lat, lng, address }) => {
            onShared({ lat, lng, address });
            onSharedSummary({ riderName: pendingRider.name, address });
            onPendingCleared();
          }}
          onCancelled={onPendingCleared}
          onDeclined={onPendingCleared}
          onExpired={onPendingCleared}
        />
      ) : null}

      {showShared && sharedSummary ? (
        <div
          className="flex gap-3 rounded-xl px-3.5 py-3"
          style={{ backgroundColor: 'rgba(0,109,67,0.08)', border: '1px solid rgba(0,109,67,0.2)' }}
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-800">
              {sharedSummary.riderName} shared their location
            </p>
            <p className="mt-0.5 flex items-start gap-1.5 text-sm text-emerald-900/80">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="break-words">{sharedSummary.address}</span>
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
