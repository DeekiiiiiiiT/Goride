/**
 * Shared fuel-entries cache for driver Fuel draft (Expenses + Payout).
 * One RQ key per driver vehicle set — avoids N× getFuelEntriesByVehicle.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../services/api';
import type { FuelEntry } from '../types/fuel';
import { DRIVER_FINANCIAL_STALE_MS } from './useDriverFinancialBundle';

export function driverFuelEntriesQueryKey(driverId: string, vehicleIds: string[]) {
  const sorted = [...vehicleIds].sort();
  return ['driverFuelEntries', driverId, sorted.join('|')] as const;
}

export function useDriverFuelEntries(driverId: string, vehicleIds: string[]) {
  const vehicleKey = useMemo(
    () => [...vehicleIds].sort().join('|'),
    [vehicleIds]
  );
  const query = useQuery({
    queryKey: driverFuelEntriesQueryKey(driverId, vehicleIds),
    queryFn: async (): Promise<FuelEntry[]> => {
      const ids = Array.from(new Set(vehicleIds.filter(Boolean)));
      if (!ids.length) return [];
      const lists = await Promise.all(
        ids.map((vid) => api.getFuelEntriesByVehicle(vid).catch(() => [] as FuelEntry[]))
      );
      const byId = new Map<string, FuelEntry>();
      for (const list of lists) {
        for (const e of list) {
          if (e?.id) byId.set(String(e.id), e);
        }
      }
      return Array.from(byId.values());
    },
    staleTime: DRIVER_FINANCIAL_STALE_MS,
    enabled: Boolean(driverId) && vehicleKey.length > 0,
  });

  return {
    entries: (query.data || []) as FuelEntry[],
    loading: query.isLoading || query.isFetching,
    error: query.isError,
    vehicleKey,
  };
}
