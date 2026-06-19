import { useCallback, useEffect, useState } from 'react';
import type { DriverEarningsPeriod, DriverEarningsSummary } from '@roam/types/rides';
import { ridesDriverMyEarnings } from '@roam/hauler-dispatch';

export function useHaulEarnings(period: DriverEarningsPeriod) {
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
    const onRefresh = () => void refresh();
    window.addEventListener('roam-driver-trip-completed', onRefresh);
    window.addEventListener('roam-driver-earnings-refresh', onRefresh);
    return () => {
      window.removeEventListener('roam-driver-trip-completed', onRefresh);
      window.removeEventListener('roam-driver-earnings-refresh', onRefresh);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
