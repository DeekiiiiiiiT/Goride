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
    clearBookerMinimized();
    onClearMinimized?.();
  }, [onClearMinimized]);

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
        if (minimizedRole === 'booker' && res.summary.roam_mode === 'shadow_roam') {
          setSummary(null);
          clearMinimized();
          return;
        }
        setSummary(res.summary);
        return;
      }

      const rideRes = await ridesGetRequest(minimizedRideId);
      const ride = rideRes.ride;
      const participantRole = rideRes.participant_role;
      const delegated = rideRes.is_delegated;

      if (minimizedRole === 'booker') {
        if (!isDelegatedBookerRole(participantRole, delegated)) {
          setSummary(null);
          clearMinimized();
          return;
        }
        if (ride.roam_mode === 'shadow_roam') {
          setSummary(null);
          clearMinimized();
          return;
        }
      } else if (participantRole !== 'passenger') {
        setSummary(null);
        clearMinimized();
        return;
      }

      if (isTerminalRideStatus(ride.status)) {
        onTerminal?.(ride.guest_passenger_name ?? null, minimizedRole);
        setSummary(null);
        clearMinimized();
        return;
      }

      setSummary(summaryFromRideResponse(minimizedRideId, minimizedRole, ride, delegated));
    } catch {
      /* keep last summary when offline */
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
