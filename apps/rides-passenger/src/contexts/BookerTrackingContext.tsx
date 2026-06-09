import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  const minimizedRideId = minimizedSession?.rideId ?? null;
  const minimizedRole = minimizedSession?.role ?? null;
  const rideIdFromPath = parseRideIdFromPath(pathname);

  const mode: BookerTrackingMode = useMemo(() => {
    if (rideIdFromPath && (!minimizedRideId || minimizedRideId !== rideIdFromPath)) {
      return 'full';
    }
    if (minimizedRideId && rideIdFromPath !== minimizedRideId) {
      return 'minimized';
    }
    if (minimizedRideId && !rideIdFromPath) {
      return 'minimized';
    }
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
      persistMinimizedRide(rideId, role);
      setMinimizedSession({ rideId, role });
      void queryClient.cancelQueries({ queryKey: ['ride', rideId] });
      void queryClient.cancelQueries({ queryKey: ['ride-live', rideId] });
      navigate('/', { replace: false });
      void refreshSummary();
    },
    [navigate, queryClient, refreshSummary],
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
    if (rideIdFromPath && minimizedRideId === rideIdFromPath) {
      clearBookerMinimized();
      setMinimizedSession(null);
    }
  }, [rideIdFromPath, minimizedRideId]);

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
