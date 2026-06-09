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
  parseRideIdFromPath,
  persistMinimizedRide,
  readMinimizedRideSession,
} from '@/lib/bookerTracking';
import { debugMinimizeLog } from '@/lib/debugMinimizeLog';

type BookerTrackingContextValue = {
  mode: BookerTrackingMode;
  minimizedRideId: string | null;
  minimizedRole: MinimizedRideRole | null;
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

  const minimize = useCallback(
    (rideId: string, role: MinimizedRideRole) => {
      minimizingRef.current = true;
      persistMinimizedRide(rideId, role);
      setMinimizedSession({ rideId, role });
      const stored = readMinimizedRideSession();
      debugMinimizeLog('BookerTrackingContext.tsx:minimize', 'minimize invoked', {
        rideId,
        role,
        storedAfterPersist: stored?.rideId ?? null,
        pathname: window.location.pathname,
        minimizingRef: minimizingRef.current,
      }, 'B');
      void queryClient.cancelQueries({ queryKey: ['ride', rideId] });
      void queryClient.cancelQueries({ queryKey: ['ride-live', rideId] });
      navigate('/', { replace: true });
    },
    [navigate, queryClient],
  );

  const openFull = useCallback(
    (rideId: string) => {
      clearBookerMinimized();
      setMinimizedSession(null);
      navigate(`/ride/${rideId}`);
    },
    [navigate],
  );

  const clear = useCallback(() => {
    clearBookerMinimized();
    setMinimizedSession(null);
    clearSummary();
  }, [clearSummary]);

  useEffect(() => {
    debugMinimizeLog('BookerTrackingContext.tsx:pathname', 'route changed', {
      pathname,
      rideIdFromPath,
      minimizedRideId,
      mode,
      sessionStored: readMinimizedRideSession()?.rideId ?? null,
      minimizingRef: minimizingRef.current,
    }, 'D');
  }, [pathname, rideIdFromPath, minimizedRideId, mode]);

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
      debugMinimizeLog('BookerTrackingContext.tsx:pathnameEffect', 'clearing minimized on ride open', {
        pathname,
        prev,
        currentRideId,
        minimizedRideId,
        minimizingRef: minimizingRef.current,
      }, 'B');
      clearBookerMinimized();
      setMinimizedSession(null);
    }
  }, [pathname, minimizedRideId]);

  const value = useMemo(
    () => ({
      mode,
      minimizedRideId,
      minimizedRole,
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
