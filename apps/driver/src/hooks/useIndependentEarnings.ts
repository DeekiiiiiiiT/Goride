import { useCallback, useEffect, useState } from 'react';
import type { DriverEarningsPeriod, DriverEarningsSummary } from '@roam/types/rides';
import { ridesDriverMyEarnings } from '../services/ridesDriverEdge';

export function useIndependentEarnings(period: DriverEarningsPeriod) {
  const [data, setData] = useState<DriverEarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await ridesDriverMyEarnings(period);
      setData(summary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load earnings');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onTripCompleted = () => void refresh();
    const onEarningsRefresh = () => void refresh();
    window.addEventListener('roam-driver-trip-completed', onTripCompleted);
    window.addEventListener('roam-driver-earnings-refresh', onEarningsRefresh);
    return () => {
      window.removeEventListener('roam-driver-trip-completed', onTripCompleted);
      window.removeEventListener('roam-driver-earnings-refresh', onEarningsRefresh);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
