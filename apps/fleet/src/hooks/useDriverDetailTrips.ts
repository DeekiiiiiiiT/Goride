/**
 * Server trip pagination for Driver Detail (Overview / Service Quality).
 * Money tabs skip this fetch (P-7). Inline tab check avoids Vite HMR TDZ (ROAM-FLEET-1T/1V).
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Trip } from '../types/data';
import { api } from '../services/api';

export type DriverDetailTripsDriver = {
  uberDriverId?: string;
  inDriveDriverId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
} | null | undefined;

export type UseDriverDetailTripsArgs = {
  driverId: string;
  driverName: string;
  driver?: DriverDetailTripsDriver;
  activeTab: string;
  startDate?: string;
  endDate?: string;
};

async function fetchDriverTripsPaged(args: {
  driverId: string;
  driverName: string;
  driver?: DriverDetailTripsDriver;
  startDate: string;
  endDate: string;
}): Promise<Trip[]> {
  const { driverId, driverName, driver, startDate, endDate } = args;
  const allIds: string[] = [driverId];
  if (driver?.uberDriverId) allIds.push(driver.uberDriverId);
  if (driver?.inDriveDriverId) allIds.push(driver.inDriveDriverId);
  const resolvedName =
    driver?.name ||
    (driver?.firstName
      ? [driver.firstName, driver.lastName].filter(Boolean).join(' ')
      : '') ||
    driverName ||
    '';

  const padDays = 60;
  const start = new Date(`${startDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - padDays);
  const paddedStart = start.toISOString().slice(0, 10);

  const PAGE_SIZE = 1000;
  const seen = new Set<string>();
  const merged: Trip[] = [];
  let pageOffset = 0;
  while (true) {
    const result = await api.getTripsFiltered({
      driverIds: allIds,
      driverName: resolvedName || undefined,
      startDate: paddedStart,
      endDate,
      limit: PAGE_SIZE,
      offset: pageOffset,
    });
    const page = result.data || [];
    for (const trip of page) {
      if (trip.id && !seen.has(trip.id)) {
        seen.add(trip.id);
        merged.push(trip);
      }
    }
    if (page.length < PAGE_SIZE) break;
    pageOffset += PAGE_SIZE;
    if (pageOffset >= 4000) break;
  }
  return merged;
}

export function useDriverDetailTrips({
  driverId,
  driverName,
  driver,
  activeTab,
  startDate,
  endDate,
}: UseDriverDetailTripsArgs) {
  // Inline tab check (not tripsTabActive) so Vite HMR cannot TDZ the gate (ROAM-FLEET-1T/1V).
  const needsTripHistory = activeTab === 'overview' || activeTab === 'quality';
  const enabled = needsTripHistory && Boolean(driverId && startDate && endDate);

  const query = useQuery({
    queryKey: [
      'driverDetailTrips',
      driverId,
      driver?.uberDriverId || '',
      driver?.inDriveDriverId || '',
      startDate || '',
      endDate || '',
    ] as const,
    queryFn: () =>
      fetchDriverTripsPaged({
        driverId,
        driverName,
        driver,
        startDate: startDate!,
        endDate: endDate!,
      }),
    enabled,
    staleTime: 2 * 60 * 1000,
  });

  useEffect(() => {
    if (!query.isError) return;
    toast.error("Couldn't load driver trips — overview may be incomplete.");
  }, [query.isError]);

  return {
    serverTrips: enabled ? query.data ?? [] : [],
    serverTripsLoaded: !needsTripHistory || query.isFetched || query.isError || !startDate || !endDate,
  };
}
