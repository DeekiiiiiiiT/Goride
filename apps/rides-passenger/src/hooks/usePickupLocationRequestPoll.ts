import { useEffect, useRef } from 'react';
import type { PickupLocationRequestDto } from '@roam/types/pickupLocationRequest';
import { getPickupLocationRequest } from '@/services/pickupLocationRequestEdge';

const POLL_MS = 3000;

type Options = {
  requestId: string | null;
  enabled?: boolean;
  onUpdate: (request: PickupLocationRequestDto) => void;
};

/** Polls pickup location request until terminal or unmount. */
export function usePickupLocationRequestPoll({
  requestId,
  enabled = true,
  onUpdate,
}: Options): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!requestId || !enabled) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const { request } = await getPickupLocationRequest(requestId);
        if (!cancelled) onUpdateRef.current(request);
      } catch {
        /* transient */
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [requestId, enabled]);
}
