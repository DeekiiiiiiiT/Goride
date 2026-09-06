/**
 * Server operational-period rollups (trips / distance) for a driver date range.
 * Fire-and-forget rebuild once per driverId so the read model stays warm.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export const DRIVER_OPERATIONAL_PERIODS_KEY = 'driverOperationalPeriods';

export type DriverOperationalPeriodRow = {
  driverId: string;
  periodAnchor: string;
  periodEnd: string;
  tripCount: number;
  completedCount: number;
  cancelledCount: number;
  distanceKm: number;
  durationMinutes: number;
  ratingSum: number;
  ratingCount: number;
  acceptanceRate: number | null;
  cancellationRate: number | null;
  platformBreakdown: Record<string, unknown>;
};

export type DriverOperationalPeriodTotals = {
  tripCount: number;
  completedCount: number;
  cancelledCount: number;
  distanceKm: number;
};

export function driverOperationalPeriodsQueryKey(
  driverId: string,
  from?: string,
  to?: string,
) {
  return [DRIVER_OPERATIONAL_PERIODS_KEY, driverId, from ?? '', to ?? ''] as const;
}

function emptyTotals(): DriverOperationalPeriodTotals {
  return { tripCount: 0, completedCount: 0, cancelledCount: 0, distanceKm: 0 };
}

export function useDriverOperationalPeriods(
  driverId: string,
  from?: string,
  to?: string,
) {
  const queryClient = useQueryClient();
  const rebuiltForDriverRef = useRef<string | null>(null);

  const enabled = Boolean(driverId);

  const query = useQuery({
    queryKey: driverOperationalPeriodsQueryKey(driverId, from, to),
    queryFn: () => api.getDriverOperationalPeriods(driverId, from, to),
    enabled,
  });

  // Once per driverId: rebuild then refresh this driver's ops periods.
  useEffect(() => {
    if (!driverId) return;
    if (rebuiltForDriverRef.current === driverId) return;
    rebuiltForDriverRef.current = driverId;
    void api
      .rebuildDriverOperationalPeriods(driverId)
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: [DRIVER_OPERATIONAL_PERIODS_KEY, driverId],
        }),
      )
      .catch(() => {
        /* non-blocking warm-up */
      });
  }, [driverId, queryClient]);

  const periods: DriverOperationalPeriodRow[] = query.data ?? [];

  const totals = useMemo(() => {
    if (!periods.length) return emptyTotals();
    return periods.reduce<DriverOperationalPeriodTotals>(
      (acc, row) => ({
        tripCount: acc.tripCount + (Number(row.tripCount) || 0),
        completedCount: acc.completedCount + (Number(row.completedCount) || 0),
        cancelledCount: acc.cancelledCount + (Number(row.cancelledCount) || 0),
        distanceKm: acc.distanceKm + (Number(row.distanceKm) || 0),
      }),
      emptyTotals(),
    );
  }, [periods]);

  return {
    periods,
    totals,
    loading: enabled && (query.isLoading || query.isFetching),
  };
}
