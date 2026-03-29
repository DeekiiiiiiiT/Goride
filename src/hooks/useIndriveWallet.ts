import { useState, useEffect, useCallback, useRef } from 'react';
import type { IndriveWalletSummary } from '../types/data';
import { api } from '../services/api';

/** YYYY-MM-DD bounds; must match `getLedgerDriverOverview` / driver detail date filter. */
export interface IndriveWalletDateRange {
  startDate: string;
  endDate: string;
}

const DEBOUNCE_MS = 300;

/**
 * Fetches `GET /ledger/driver-indrive-wallet` — period loads, period fees, lifetime loads.
 * Skips the network call when `driverId` or `range` is missing.
 * Debounces range changes (Phase 6) so rapid date-picker changes do not spam the API.
 */
export function useIndriveWallet(
  driverId: string | undefined,
  range: IndriveWalletDateRange | null | undefined
): {
  data: IndriveWalletSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<IndriveWalletSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchGenRef = useRef(0);

  const fetchForRange = useCallback(
    async (startDate: string, endDate: string, gen: number) => {
      if (!driverId) return;
      setLoading(true);
      setError(null);
      try {
        const next = await api.getDriverIndriveWallet({ driverId, startDate, endDate });
        if (fetchGenRef.current !== gen) return;
        setData(next);
      } catch (e: unknown) {
        if (fetchGenRef.current !== gen) return;
        const message = e instanceof Error ? e.message : 'Failed to load InDrive wallet';
        console.error('[useIndriveWallet]', e);
        setError(message);
        setData(null);
      } finally {
        if (fetchGenRef.current === gen) setLoading(false);
      }
    },
    [driverId]
  );

  useEffect(() => {
    if (!driverId || !range?.startDate || !range?.endDate) {
      fetchGenRef.current += 1;
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      void fetchForRange(range.startDate, range.endDate, gen);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      if (fetchGenRef.current === gen) setLoading(false);
    };
  }, [driverId, range?.startDate, range?.endDate, fetchForRange]);

  const refetch = useCallback(async () => {
    if (!driverId || !range?.startDate || !range?.endDate) return;
    const gen = ++fetchGenRef.current;
    await fetchForRange(range.startDate, range.endDate, gen);
  }, [driverId, range?.startDate, range?.endDate, fetchForRange]);

  return { data, loading, error, refetch };
}
