import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ActiveRideSummaryDto } from '@roam/types/rides';
import { useBookerActiveRideSummary } from '@/hooks/useBookerActiveRideSummary';
import {
  type BookerTrackingMode,
  type MinimizedRideRole,
  type MinimizedRideSession,
  clearBookerMinimized,
  clearMinimizeExitPending,
  isShadowMinimizedBookerSession,
  parseRideIdFromPath,
  persistMinimizedRide,
  readMinimizeExitPending,
  readMinimizedRideSession,
  setMinimizeExitPending,
} from '@/lib/bookerTracking';
import { isShadowBookerTrip, navigateToDelegatedRide } from '@/lib/delegatedRideNavigation';

type BookerTrackingContextValue = {
  mode: BookerTrackingMode;
  minimizedRideId: string | null;
  minimizedRole: MinimizedRideRole | null;
  minimizedRoamMode: 'open_roam' | 'shadow_roam' | null;
  exitPendingRideId: string | null;
  summary: ActiveRideSummaryDto | null;
  summaryLoading: boolean;
  minimize: (rideId: string, role: MinimizedRideRole) => void;
  openFull: (rideId: string) => void;
  clear: () => void;
  refreshSummary: () => Promise<void>;
};

const BookerTrackingContext = createContext<BookerTrackingContextValue | null>(null);

export function BookerTrackingProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const [minimizedSession, setMinimizedSession] = useState<MinimizedRideSession | null>(() =>
    readMinimizedRideSession(),
  );
  const [exitPendingRideId, setExitPendingRideId] = useState<string | null>(() =>
    readMinimizeExitPending(),
  );
  const minimizingRef = useRef(false);
  const prevPathnameRef = useRef(pathname);

  const minimizedRideId = minimizedSession?.rideId ?? null;
  const minimizedRole = minimizedSession?.role ?? null;
  const rideIdFromPath = parseRideIdFromPath(pathname);

  /** On ride route = full tracker; off ride with session = minimized chip. */
  const mode: BookerTrackingMode = useMemo(() => {
    if (rideIdFromPath) return 'full';
    if (minimizedRideId) return 'minimized';
    return 'off';
  }, [rideIdFromPath, minimizedRideId]);

  const handleTerminal = useCallback(
    (name: string | null, role: MinimizedRideRole) => {
      if (!minimizedRideId) return;
      if (role === 'booker') {
        toast.message(name ? `Ride for ${name} ended` : 'Your booked ride ended');
      } else {
        toast.message('Your ride ended');
      }
    },
    [minimizedRideId],
  );

  const handleClearMinimized = useCallback(() => {
    setMinimizedSession(null);
  }, []);

  const {
    summary,
    loading: summaryLoading,
    refresh: refreshSummary,
    clearSummary,
  } = useBookerActiveRideSummary({
    mode,
    minimizedRideId,
    minimizedRole,
    onTerminal: handleTerminal,
    onClearMinimized: handleClearMinimized,
  });

  const minimizedRoamMode = minimizedSession?.roamMode ?? summary?.roam_mode ?? null;

  useEffect(() => {
    const session = readMinimizedRideSession();
    if (isShadowMinimizedBookerSession(session)) {
      clearBookerMinimized();
      setMinimizedSession(null);
    }
  }, []);

  const minimize = useCallback(
    (rideId: string, role: MinimizedRideRole) => {
      const roamMode = summary?.roam_mode ?? null;
      if (role === 'booker' && isShadowBookerTrip(role, roamMode)) {
        navigateToDelegatedRide(navigate, rideId, role, roamMode, { replace: true });
        return;
      }
      minimizingRef.current = true;
      setMinimizeExitPending(rideId);
      setExitPendingRideId(rideId);
      persistMinimizedRide(rideId, role, roamMode);
      setMinimizedSession({ rideId, role, roamMode: roamMode ?? undefined });
      void queryClient.cancelQueries({ queryKey: ['ride', rideId] });
      void queryClient.cancelQueries({ queryKey: ['ride-live', rideId] });
      navigate('/', { replace: true });
    },
    [navigate, queryClient, summary?.roam_mode],
  );

  const openFull = useCallback(
    (rideId: string) => {
      clearMinimizeExitPending();
      setExitPendingRideId(null);
      clearBookerMinimized();
      setMinimizedSession(null);
      const role = minimizedRole ?? 'booker';
      const roamMode = summary?.roam_mode ?? null;
      navigateToDelegatedRide(navigate, rideId, role, roamMode);
    },
    [navigate, minimizedRole, summary?.roam_mode],
  );

  const clear = useCallback(() => {
    clearMinimizeExitPending();
    setExitPendingRideId(null);
    clearBookerMinimized();
    setMinimizedSession(null);
    clearSummary();
  }, [clearSummary]);

  useEffect(() => {
    if (pathname === '/' || !parseRideIdFromPath(pathname)) {
      clearMinimizeExitPending();
      setExitPendingRideId(null);
    }
  }, [pathname]);

  useEffect(() => {
    if (!parseRideIdFromPath(pathname)) {
      minimizingRef.current = false;
    }
  }, [pathname]);

  /** Re-open full tracker when navigating to /ride/:id from elsewhere (not minimize). */
  useEffect(() => {
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname;
    if (minimizingRef.current) return;

    const currentRideId = parseRideIdFromPath(pathname);
    const prevRideId = parseRideIdFromPath(prev);
    if (
      currentRideId &&
      minimizedRideId === currentRideId &&
      prevRideId !== currentRideId
    ) {
      clearMinimizeExitPending();
      setExitPendingRideId(null);
      clearBookerMinimized();
      setMinimizedSession(null);
    }
  }, [pathname, minimizedRideId]);

  const value = useMemo(
    () => ({
      mode,
      minimizedRideId,
      minimizedRole,
      minimizedRoamMode,
      exitPendingRideId,
      summary,
      summaryLoading,
      minimize,
      openFull,
      clear,
      refreshSummary,
    }),
    [
      mode,
      minimizedRideId,
      minimizedRole,
      minimizedRoamMode,
      exitPendingRideId,
      summary,
      summaryLoading,
      minimize,
      openFull,
      clear,
      refreshSummary,
    ],
  );

  return (
    <BookerTrackingContext.Provider value={value}>{children}</BookerTrackingContext.Provider>
  );
}

export function useBookerTracking(): BookerTrackingContextValue {
  const ctx = useContext(BookerTrackingContext);
  if (!ctx) {
    throw new Error('useBookerTracking must be used within BookerTrackingProvider');
  }
  return ctx;
}

/** Safe for RidePage when provider is mounted at App level. */
export function useBookerTrackingOptional(): BookerTrackingContextValue | null {
  return useContext(BookerTrackingContext);
}
