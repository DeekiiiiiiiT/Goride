import { useCallback, useEffect, useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { ridesDriverMyTrips } from '../services/ridesDriverEdge';

const PAGE_SIZE = 25;

export function useIndependentTrips(enabled = true) {
  const [trips, setTrips] = useState<RideRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async (fetchAll = false) => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const limit = fetchAll ? 100 : PAGE_SIZE;
      const { trips: rows, total: count } = await ridesDriverMyTrips({ page: 1, limit });
      setTrips(rows);
      setTotal(count);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load trips');
      setTrips([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useEffect(() => {
    const onTripCompleted = () => void refresh(false);
    window.addEventListener('roam-driver-trip-completed', onTripCompleted);
    return () => window.removeEventListener('roam-driver-trip-completed', onTripCompleted);
  }, [refresh]);

  const loadAll = useCallback(() => refresh(true), [refresh]);

  return { trips, loading, error, total, refresh, loadAll };
}
