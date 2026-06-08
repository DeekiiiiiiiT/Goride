import { useCallback, useEffect, useState } from 'react';
import type { ActiveRideSummaryDto } from '@roam/types/rides';
import { ridesGetMyActiveRideSummary } from '@/services/ridesEdge';
import {
  type BookerTrackingMode,
  clearBookerMinimized,
  isDelegatedBookerRole,
  isTerminalRideStatus,
} from '@/lib/bookerTracking';

type Options = {
  mode: BookerTrackingMode;
  minimizedRideId: string | null;
  onTerminal?: (name: string | null) => void;
  onClearMinimized?: () => void;
};

/**
 * Focus-only refresh for the minimized booker chip — no background interval.
 */
export function useBookerActiveRideSummary({
  mode,
  minimizedRideId,
  onTerminal,
  onClearMinimized,
}: Options) {
  const [summary, setSummary] = useState<ActiveRideSummaryDto | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    if (mode !== 'minimized' && !minimizedRideId) return;

    setLoading(true);
    try {
      const res = await ridesGetMyActiveRideSummary();
      if (!res.summary) {
        setSummary(null);
        clearBookerMinimized();
        onClearMinimized?.();
        return;
      }
      if (!isDelegatedBookerRole(res.summary.participant_role, res.summary.is_delegated)) {
        setSummary(null);
        clearBookerMinimized();
        onClearMinimized?.();
        return;
      }
      if (res.summary.roam_mode === 'shadow_roam') {
        setSummary(null);
        clearBookerMinimized();
        onClearMinimized?.();
        return;
      }
      if (isTerminalRideStatus(res.summary.status)) {
        onTerminal?.(res.summary.guest_passenger_name);
        setSummary(null);
        clearBookerMinimized();
        onClearMinimized?.();
        return;
      }
      setSummary(res.summary);
    } catch {
      /* keep last summary when offline */
    } finally {
      setLoading(false);
    }
  }, [mode, minimizedRideId, onTerminal, onClearMinimized]);

  useEffect(() => {
    if (mode !== 'minimized' && !minimizedRideId) return;
    void refresh();
  }, [mode, minimizedRideId, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (mode !== 'minimized' && !minimizedRideId) return;
      void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [mode, minimizedRideId, refresh]);

  const clearSummary = useCallback(() => {
    setSummary(null);
  }, []);

  return { summary, loading, refresh, clearSummary };
}
