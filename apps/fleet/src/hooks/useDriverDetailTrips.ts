/**
 * Server trip pagination for Driver Detail (Overview / Service Quality).
 * Money tabs skip this fetch (P-7). Inline tab check avoids Vite HMR TDZ (ROAM-FLEET-1T/1V).
 */
import * as React from 'react';
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

export function useDriverDetailTrips({
  driverId,
  driverName,
  driver,
  activeTab,
  startDate,
  endDate,
}: UseDriverDetailTripsArgs) {
  const [serverTrips, setServerTrips] = React.useState<Trip[]>([]);
  const [serverTripsLoaded, setServerTripsLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    // Inline tab check (not tripsTabActive) so Vite HMR cannot TDZ the gate (ROAM-FLEET-1T/1V).
    const needsTripHistory = activeTab === 'overview' || activeTab === 'quality';
    if (!needsTripHistory) {
      setServerTripsLoaded(true);
      return;
    }
    if (!startDate || !endDate) {
      setServerTrips([]);
      setServerTripsLoaded(false);
      return;
    }

    setServerTripsLoaded(false);
    const fetchDriverTripsForPeriod = async () => {
      try {
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

        // Pad before period start for gap / continuity math without loading forever.
        const padDays = 60;
        const start = new Date(`${startDate}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() - padDays);
        const paddedStart = start.toISOString().slice(0, 10);

        const PAGE_SIZE = 1000;
        const seen = new Set<string>();
        const merged: Trip[] = [];
        let pageOffset = 0;
        while (true) {
          const result = await api
            .getTripsFiltered({
              driverIds: allIds,
              driverName: resolvedName || undefined,
              startDate: paddedStart,
              endDate,
              limit: PAGE_SIZE,
              offset: pageOffset,
            })
            .catch(() => ({ data: [] as Trip[], total: 0 }));
          if (cancelled) return;
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

        setServerTrips(merged);
      } catch (err) {
        console.error('[DriverDetail] Failed to fetch server trips:', err);
      } finally {
        if (!cancelled) setServerTripsLoaded(true);
      }
    };

    // Yield so roster/shell requests claim connections first (HTTP/1.1 overhead).
    const timer = window.setTimeout(() => {
      void fetchDriverTripsForPeriod();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activeTab,
    driverId,
    driver?.uberDriverId,
    driver?.inDriveDriverId,
    driver?.name,
    driver?.firstName,
    driver?.lastName,
    driverName,
    startDate,
    endDate,
  ]);

  return { serverTrips, serverTripsLoaded };
}
