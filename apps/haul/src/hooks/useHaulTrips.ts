import { useCallback, useEffect, useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { ridesDriverMyTrips } from '@roam/hauler-dispatch';

export function useHaulTrips(limit = 50) {
  const [trips, setTrips] = useState<RideRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ridesDriverMyTrips({ limit });
      setTrips(res.trips ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load trips');
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onRefresh = () => void refresh();
    window.addEventListener('roam-driver-trip-completed', onRefresh);
    return () => window.removeEventListener('roam-driver-trip-completed', onRefresh);
  }, [refresh]);

  return { trips, loading, error, refresh };
}
