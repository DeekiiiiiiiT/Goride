import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PickupLocationRequestDto } from '@roam/types/pickupLocationRequest';
import {
  cancelPickupLocationRequest,
  createPickupLocationRequest,
} from '@/services/pickupLocationRequestEdge';
import { usePickupLocationRequestPoll } from '@/hooks/usePickupLocationRequestPoll';
import type { RiderPickupTarget } from '@/lib/riderPickupTarget';
import { pickupLocationRequestCreatedToast } from '@/lib/pickupLocationRequestCopy';
import { ON_SURFACE_VARIANT, PRIMARY, SURFACE_LOW } from '@/lib/passengerTheme';

export type SharedPickupCoords = {
  lat: number;
  lng: number;
  address: string;
  accuracyMeters?: number | null;
};

type Props = {
  requestId: string;
  riderName: string;
  riderTarget: RiderPickupTarget;
  onShared: (coords: SharedPickupCoords) => void;
  onCancelled: () => void;
  onDeclined: () => void;
  onExpired: () => void;
};

export function PickupLocationRequestStatus({
  requestId,
  riderName,
  riderTarget,
  onShared,
  onCancelled,
  onDeclined,
  onExpired,
}: Props) {
  const [cancelling, setCancelling] = useState(false);
  const [resending, setResending] = useState(false);
  const [activeId, setActiveId] = useState(requestId);
  const handledRef = useRef(false);

  useEffect(() => {
    setActiveId(requestId);
    handledRef.current = false;
  }, [requestId]);

  const handleTerminal = useCallback(
    (request: PickupLocationRequestDto) => {
      if (handledRef.current) return;
      if (request.status === 'shared' && request.pickup_lat != null && request.pickup_lng != null) {
        handledRef.current = true;
        onShared({
          lat: request.pickup_lat,
          lng: request.pickup_lng,
          address: request.pickup_address ?? `${request.pickup_lat}, ${request.pickup_lng}`,
          accuracyMeters: request.accuracy_meters,
        });
        return;
      }
      if (request.status === 'declined') {
        handledRef.current = true;
        toast.message(`${riderName} declined to share their location`);
        onDeclined();
        return;
      }
      if (request.status === 'expired') {
        handledRef.current = true;
        toast.message('Location request expired');
        onExpired();
        return;
      }
      if (request.status === 'cancelled') {
        handledRef.current = true;
        onCancelled();
      }
    },
    [riderName, onShared, onCancelled, onDeclined, onExpired],
  );

  usePickupLocationRequestPoll({
    requestId: activeId,
    onUpdate: handleTerminal,
  });

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelPickupLocationRequest(activeId);
      onCancelled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not cancel request');
    } finally {
      setCancelling(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      try {
        await cancelPickupLocationRequest(activeId);
      } catch {
        /* may already be terminal */
      }
      const { request, delivery_channel, sms_sent } = await createPickupLocationRequest({
        rider_name: riderTarget.name,
        rider_phone_e164: riderTarget.phone_e164,
        rider_source: riderTarget.source,
        rider_user_id: riderTarget.user_id ?? null,
        rider_contact_id: riderTarget.contact_id ?? null,
      });
      toast.message(pickupLocationRequestCreatedToast(riderTarget.name, delivery_channel, sms_sent));
      handledRef.current = false;
      setActiveId(request.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not resend request';
      if (message.includes('rate_limited')) {
        toast.error('Too many requests — try again in a few minutes.');
      } else {
        toast.error(message);
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-xl px-3.5 py-3"
      style={{ backgroundColor: SURFACE_LOW, border: '1px solid rgba(0,74,198,0.12)' }}
    >
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: PRIMARY }} aria-hidden />
        <p className="text-sm font-medium" style={{ color: ON_SURFACE_VARIANT }}>
          Waiting for <strong style={{ color: PRIMARY }}>{riderName}</strong> to share their location…
        </p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={cancelling || resending}
          onClick={() => void handleCancel()}
          className="text-xs font-semibold disabled:opacity-50"
          style={{ color: ON_SURFACE_VARIANT }}
        >
          {cancelling ? 'Cancelling…' : 'Cancel'}
        </button>
        <button
          type="button"
          disabled={cancelling || resending}
          onClick={() => void handleResend()}
          className="text-xs font-semibold disabled:opacity-50"
          style={{ color: PRIMARY }}
        >
          {resending ? 'Resending…' : 'Resend'}
        </button>
      </div>
    </div>
  );
}
