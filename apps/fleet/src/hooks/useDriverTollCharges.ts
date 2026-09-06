/**
 * Driver toll disposition totals for Financials → Reconciliation.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export type DriverTollChargeTotals = {
  chargedToDriver: number;
  writtenOff: number;
  business: number;
  refunded: number;
  reconciled: number;
  cashWash: number;
  unresolved: number;
};

export function useDriverTollCharges(opts: {
  driverId: string;
  from?: string;
  to?: string;
  enabled?: boolean;
}) {
  const { driverId, from, to, enabled = true } = opts;
  const ranged = Boolean(from && to);

  const query = useQuery({
    queryKey: ['driverTollCharges', driverId, from || '', to || ''] as const,
    queryFn: async () => {
      const res = await api.getDriverTollCharges(
        driverId,
        ranged ? { from: from!, to: to! } : undefined,
      );
      return (res?.data?.totals ?? null) as DriverTollChargeTotals | null;
    },
    enabled: Boolean(driverId) && enabled,
    staleTime: DRIVER_FINANCIAL_STALE_MS,
  });

  useEffect(() => {
    if (!query.isError) return;
    toast.error("Couldn't load toll disposition — retry or check your connection.");
  }, [query.isError]);

  return {
    tollTotals: query.data ?? null,
    loading: query.isLoading || query.isFetching,
    error: query.isError,
    refetch: query.refetch,
  };
}
