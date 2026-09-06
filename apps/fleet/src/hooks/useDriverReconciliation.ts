/**
 * Server Uber SSOT-vs-ledger reconciliation for one Financials window.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export type DriverReconciliationResult = {
  ssotNet: number;
  ledgerNet: number;
  delta: number;
  status: string;
  source: string;
};

export function useDriverReconciliation(opts: {
  driverId: string;
  from?: string;
  to?: string;
  enabled?: boolean;
}) {
  const { driverId, from, to, enabled = true } = opts;

  const query = useQuery({
    queryKey: ['driverReconciliation', driverId, from || '', to || ''] as const,
    queryFn: async (): Promise<DriverReconciliationResult> => {
      const res: any = await api.getDriverReconciliation(driverId, from!, to!);
      return {
        ssotNet: Number(res?.ssot?.netEarnings) || 0,
        ledgerNet: Number(res?.ledger?.netEarnings) || 0,
        delta: Number(res?.delta) || 0,
        status: String(res?.status || 'mismatch'),
        source: String(res?.source || 'unavailable'),
      };
    },
    enabled: Boolean(driverId && from && to) && enabled,
    staleTime: DRIVER_FINANCIAL_STALE_MS,
  });

  useEffect(() => {
    if (!query.isError) return;
    toast.error("Couldn't load reconciliation — retry or check your connection.");
  }, [query.isError]);

  return {
    serverRecon: query.data ?? null,
    loading: query.isLoading || query.isFetching,
    error: query.isError,
    refetch: query.refetch,
  };
}
