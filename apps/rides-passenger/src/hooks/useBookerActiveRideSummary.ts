import { useCallback, useEffect, useState } from 'react';
import type { ActiveRideSummaryDto } from '@roam/types/rides';
import { ridesGetMyActiveRideSummary, ridesGetRequest } from '@/services/ridesEdge';
import {
  type BookerTrackingMode,
  type MinimizedRideRole,
  clearBookerMinimized,
  isDelegatedBookerRole,
  isTerminalRideStatus,
} from '@/lib/bookerTracking';
import { debugMinimizeLog } from '@/lib/debugMinimizeLog';

type Options = {
  mode: BookerTrackingMode;
  minimizedRideId: string | null;
  minimizedRole: MinimizedRideRole | null;
  onTerminal?: (name: string | null, role: MinimizedRideRole) => void;
  onClearMinimized?: () => void;
};

function summaryMatchesMinimized(
  summary: ActiveRideSummaryDto,
  rideId: string,
  role: MinimizedRideRole,
): boolean {
  if (summary.ride_id !== rideId) return false;
  if (role === 'booker') {
    return isDelegatedBookerRole(summary.participant_role, summary.is_delegated);
  }
  return summary.participant_role === 'passenger';
}

function summaryFromRideResponse(
  rideId: string,
  role: MinimizedRideRole,
  ride: {
    id: string;
    status: ActiveRideSummaryDto['status'];
    guest_passenger_name?: string | null;
    roam_mode?: 'open_roam' | 'shadow_roam' | null;
  },
  isDelegated?: boolean,
): ActiveRideSummaryDto {
  return {
    ride_id: rideId,
    status: ride.status,
    guest_passenger_name:
      typeof ride.guest_passenger_name === 'string' ? ride.guest_passenger_name : null,
    participant_role: role,
    is_delegated: role === 'booker' ? Boolean(isDelegated) : Boolean(isDelegated),
    roam_mode: ride.roam_mode ?? null,
  };
}

/**
 * Focus-only refresh for the minimized trip chip — no background interval.
 * Never clears minimized state except when the trip is confirmed terminal.
 */
export function useBookerActiveRideSummary({
  mode,
  minimizedRideId,
  minimizedRole,
  onTerminal,
  onClearMinimized,
}: Options) {
  const [summary, setSummary] = useState<ActiveRideSummaryDto | null>(null);
  const [loading, setLoading] = useState(false);

  const clearMinimized = useCallback(() => {
    debugMinimizeLog('useBookerActiveRideSummary.ts:clearMinimized', 'clearing minimized session', {
      minimizedRideId,
      mode,
    }, 'E');
    clearBookerMinimized();
    onClearMinimized?.();
  }, [onClearMinimized, minimizedRideId, mode]);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    if (mode !== 'minimized' && !minimizedRideId) return;
    if (!minimizedRideId || !minimizedRole) return;

    setLoading(true);
    try {
      const res = await ridesGetMyActiveRideSummary();
      if (
        res.summary &&
        summaryMatchesMinimized(res.summary, minimizedRideId, minimizedRole)
      ) {
        if (isTerminalRideStatus(res.summary.status)) {
          onTerminal?.(res.summary.guest_passenger_name, minimizedRole);
          setSummary(null);
          clearMinimized();
          return;
        }
        setSummary(res.summary);
        return;
      }

      const rideRes = await ridesGetRequest(minimizedRideId);
      const ride = rideRes.ride;

      if (isTerminalRideStatus(ride.status)) {
        onTerminal?.(ride.guest_passenger_name ?? null, minimizedRole);
        setSummary(null);
        clearMinimized();
        return;
      }

      const participantRole = rideRes.participant_role;
      const delegated = rideRes.is_delegated;
      setSummary(summaryFromRideResponse(minimizedRideId, minimizedRole, ride, delegated));

      if (minimizedRole === 'booker' && !isDelegatedBookerRole(participantRole, delegated)) {
        /* keep minimized — user explicitly chose to leave the tracker */
      }
      if (minimizedRole === 'passenger' && participantRole !== 'passenger') {
        /* keep minimized */
      }
    } catch {
      /* keep minimized session + last summary when offline */
    } finally {
      setLoading(false);
    }
  }, [mode, minimizedRideId, minimizedRole, onTerminal, clearMinimized]);

  useEffect(() => {
    if (mode !== 'minimized' && !minimizedRideId) return;
    void refresh();
  }, [mode, minimizedRideId, minimizedRole, refresh]);

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
