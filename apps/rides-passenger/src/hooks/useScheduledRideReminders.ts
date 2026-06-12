import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { isScheduledRidesEnabled } from '@/lib/scheduledRidesFlags';
import { ridesListScheduled } from '@/services/ridesEdge';

const ONE_HOUR_MS = 60 * 60 * 1000;
const POLL_MS = 5 * 60 * 1000;

/**
 * In-app reminder MVP: toast when a scheduled pickup is within one hour.
 * Extension point for push/email — see scheduledRides/notificationHooks.ts (server).
 */
export function useScheduledRideReminders(enabled: boolean) {
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !isScheduledRidesEnabled()) return;

    const check = async () => {
      try {
        const { rides } = await ridesListScheduled();
        const now = Date.now();
        for (const ride of rides) {
          if (!ride.scheduled_pickup_at) continue;
          const pickup = Date.parse(ride.scheduled_pickup_at);
          if (!Number.isFinite(pickup)) continue;
          const until = pickup - now;
          if (until > 0 && until <= ONE_HOUR_MS && !notifiedRef.current.has(ride.id)) {
            notifiedRef.current.add(ride.id);
            toast.message('Pickup coming up', {
              description: 'Your scheduled ride is within the next hour. See Activity for details.',
            });
          }
        }
      } catch {
        /* non-blocking */
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);
}
