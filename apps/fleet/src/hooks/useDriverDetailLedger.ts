/**
 * Ledger driver-overview fetch for Driver Detail (date-range aware).
 * Repair handlers bump ledgerRefreshKey (kept in query key for forced refresh).
 */
import * as React from 'react';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LedgerDriverOverview } from '../types/data';
import { api } from '../services/api';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export type UseDriverDetailLedgerArgs = {
  driverId: string;
  startDate?: string;
  endDate?: string;
  selectedPlatforms: Set<string>;
};

export function useDriverDetailLedger({
  driverId,
  startDate,
  endDate,
  selectedPlatforms,
}: UseDriverDetailLedgerArgs) {
  const [ledgerRefreshKey, setLedgerRefreshKey] = React.useState(0);
  const platformsKey = selectedPlatforms.has('All')
    ? 'All'
    : Array.from(selectedPlatforms).sort().join(',');

  const query = useQuery({
    queryKey: [
      'ledgerDriverOverview',
      driverId,
      startDate || '',
      endDate || '',
      platformsKey,
      ledgerRefreshKey,
    ] as const,
    queryFn: async (): Promise<LedgerDriverOverview> => {
      const platforms = selectedPlatforms.has('All')
        ? undefined
        : Array.from(selectedPlatforms);
      return api.getLedgerDriverOverview({
        driverId,
        startDate: startDate!,
        endDate: endDate!,
        platforms,
      });
    },
    enabled: Boolean(driverId && startDate && endDate),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
  });

  useEffect(() => {
    if (!query.isError) return;
    toast.error("Couldn't load driver overview KPIs — numbers may be incomplete.");
  }, [query.isError]);

  return {
    ledgerOverview: query.data ?? null,
    ledgerOverviewLoaded: query.isFetched || query.isError,
    ledgerRefreshKey,
    setLedgerRefreshKey,
  };
}
