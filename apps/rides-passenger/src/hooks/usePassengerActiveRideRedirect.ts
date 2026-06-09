import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ridesGetMyActiveRideSummary } from '@/services/ridesEdge';
import { readMinimizedRideSession } from '@/lib/bookerTracking';

/**
 * Auto-opens the live ride screen for delegated passengers only.
 * Skipped when the rider minimized the tracker — they can reopen from Active trips or the chip.
 */
export function usePassengerActiveRideRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const promptedRideId = useRef<string | null>(null);

  useEffect(() => {
    if (pathname.startsWith('/ride/')) return;

    let cancelled = false;

    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const minimized = readMinimizedRideSession();
      if (minimized?.role === 'passenger') return;
      try {
        const { summary } = await ridesGetMyActiveRideSummary();
        if (cancelled || !summary?.ride_id || summary.participant_role !== 'passenger') return;
        if (minimized?.rideId === summary.ride_id) return;
        if (promptedRideId.current === summary.ride_id) return;

        promptedRideId.current = summary.ride_id;
        toast.message('Your ride is ready', {
          description: 'Opening your trip — share your PIN with the driver when they arrive.',
          duration: 4000,
        });
        navigate(`/ride/${summary.ride_id}`, { replace: true });
      } catch {
        /* ignore */
      }
    };

    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pathname, navigate]);
}
