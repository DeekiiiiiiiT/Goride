import { useCallback, useEffect, useState } from 'react';
import type { DriverWalletsResponse } from '@roam/types/rides';
import { ridesDriverWallets } from '../services/ridesDriverEdge';

export function useDriverWallets(currency = 'JMD') {
  const [wallets, setWallets] = useState<DriverWalletsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ridesDriverWallets(currency);
      setWallets(res.wallets);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load wallets');
      setWallets(null);
    } finally {
      setLoading(false);
    }
  }, [currency]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onTripCompleted = () => void refresh();
    window.addEventListener('roam-driver-trip-completed', onTripCompleted);
    return () => window.removeEventListener('roam-driver-trip-completed', onTripCompleted);
  }, [refresh]);

  return { wallets, loading, error, refresh };
}
