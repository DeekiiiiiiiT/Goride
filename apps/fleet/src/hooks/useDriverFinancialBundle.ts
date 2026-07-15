/**
 * Shared driver Financials core bundle — one React Query–backed load for
 * Expenses / Settlement / Payout / Cash Wallet. Stops each tab from re-downloading
 * fleet drivers, vehicles, all finalized reports, and all dispute refunds.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { DisputeRefund } from '../types/data';
import { expandDriverTransactionIds } from '../utils/expandDriverTransactionIds';

export const DRIVER_FINANCIAL_STALE_MS = 3 * 60 * 1000;

export type DriverLike = {
  id?: string;
  driverId?: string;
  uberDriverId?: string;
  inDriveDriverId?: string;
  [key: string]: unknown;
};

export function nativeDriverIdSet(driver: DriverLike | null | undefined, fallbackId: string): Set<string> {
  const ids = new Set<string>();
  if (fallbackId) ids.add(fallbackId);
  if (driver?.id) ids.add(String(driver.id));
  if (driver?.driverId) ids.add(String(driver.driverId));
  return ids;
}

export function expandedDriverIds(driver: DriverLike | null | undefined, fallbackId: string): string[] {
  return Array.from(
    expandDriverTransactionIds([
      fallbackId,
      driver?.id,
      driver?.driverId,
      driver?.uberDriverId,
      driver?.inDriveDriverId,
    ])
  );
}

export function filterDriverVehicles(vehicles: any[], nativeIds: Set<string>): any[] {
  return (vehicles || []).filter(
    (v: any) => v?.currentDriverId && nativeIds.has(v.currentDriverId)
  );
}

export type DriverFinancialBundle = {
  driverId: string;
  driver: DriverLike | null;
  expandedIds: string[];
  nativeIds: string[];
  vehicles: any[];
  vehicleIds: string[];
  finalizedReports: any[];
  disputeRefunds: DisputeRefund[];
  unifiedToll: boolean;
  isCoreLoading: boolean;
  isCoreError: boolean;
};

export function useDriverFinancialBundle(
  driverId: string,
  driver?: DriverLike | null
): DriverFinancialBundle {
  const nativeIds = useMemo(
    () => Array.from(nativeDriverIdSet(driver, driverId)).sort(),
    [driver, driverId]
  );
  const expandedIds = useMemo(
    () => expandedDriverIds(driver, driverId).sort(),
    [driver, driverId]
  );

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.getVehicles(),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
  });

  const driverVehicles = useMemo(
    () => filterDriverVehicles(vehiclesQuery.data || [], new Set(nativeIds)),
    [vehiclesQuery.data, nativeIds]
  );
  const vehicleIds = useMemo(
    () => driverVehicles.map((v: any) => v.id).filter(Boolean).sort() as string[],
    [driverVehicles]
  );

  const finalizedQuery = useQuery({
    queryKey: ['finalizedReports', nativeIds, vehicleIds],
    queryFn: () =>
      nativeIds.length === 0 && vehicleIds.length === 0
        ? Promise.resolve([])
        : api.getFinalizedReports({
            driverIds: nativeIds,
            vehicleIds: vehicleIds.length ? vehicleIds : undefined,
          }),
    enabled: !vehiclesQuery.isLoading,
    staleTime: DRIVER_FINANCIAL_STALE_MS,
  });

  const disputeQuery = useQuery({
    queryKey: ['disputeRefunds', expandedIds],
    queryFn: () =>
      expandedIds.length === 0
        ? Promise.resolve({ data: [] as DisputeRefund[], total: 0 })
        : api.getDisputeRefunds({ driverIds: expandedIds }),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
  });

  const settingsQuery = useQuery({
    queryKey: ['tollAutomationSettings'],
    queryFn: () => api.getTollAutomationSettings(),
    staleTime: DRIVER_FINANCIAL_STALE_MS,
  });

  const finalizedReports = useMemo(() => {
    const all = finalizedQuery.data || [];
    const nativeSet = new Set(nativeIds);
    const vehicleIdSet = new Set(vehicleIds);
    return all.filter((r: any) => {
      if (r?.status !== 'Finalized') return false;
      if (r?.driverId && nativeSet.has(r.driverId)) return true;
      // Legacy snapshots keyed/filtered by vehicle only
      if (!r?.driverId && vehicleIdSet.size && vehicleIdSet.has(r.vehicleId)) return true;
      return false;
    });
  }, [finalizedQuery.data, nativeIds, vehicleIds]);

  const isCoreLoading =
    vehiclesQuery.isLoading ||
    finalizedQuery.isLoading ||
    disputeQuery.isLoading ||
    settingsQuery.isLoading;

  const isCoreError =
    vehiclesQuery.isError ||
    finalizedQuery.isError ||
    disputeQuery.isError;

  return {
    driverId,
    driver: driver ?? null,
    expandedIds,
    nativeIds,
    vehicles: driverVehicles,
    vehicleIds,
    finalizedReports,
    disputeRefunds: disputeQuery.data?.data || [],
    unifiedToll: settingsQuery.data?.data?.unifiedTollSettlementEnabled === true,
    isCoreLoading,
    isCoreError,
  };
}
