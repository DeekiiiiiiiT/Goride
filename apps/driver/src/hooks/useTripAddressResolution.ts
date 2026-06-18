import { useEffect, useMemo, useRef } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { Trip } from '../types/data';
import { resolveMissingTripAddresses } from '../utils/addressResolver';
import {
  DriverOption,
  VehicleOption,
  getUnresolvedTripKey,
  tripNeedsAddressResolution,
} from '../utils/tripManifestHelpers';
import { resolveMissingTripVehicles } from '../utils/tripVehicleResolver';

export function useTripAddressResolution(
  trips: Trip[],
  queryClient: QueryClient,
  vehicles: VehicleOption[] = [],
  drivers: DriverOption[] = []
) {
  const attemptedAddressRef = useRef<Set<string>>(new Set());
  const attemptedVehicleRef = useRef<Set<string>>(new Set());
  const tripsRef = useRef(trips);
  tripsRef.current = trips;

  const pendingAddressKey = useMemo(() => getUnresolvedTripKey(trips), [trips]);

  const pendingVehicleKey = useMemo(
    () =>
      trips
        .filter((trip) => !trip.vehicleId)
        .map((trip) => trip.id)
        .sort()
        .join(','),
    [trips]
  );

  useEffect(() => {
    if (!pendingAddressKey) return;

    const pendingTrips = tripsRef.current.filter(
      (trip) =>
        tripNeedsAddressResolution(trip) && !attemptedAddressRef.current.has(trip.id)
    );
    if (pendingTrips.length === 0) return;

    pendingTrips.forEach((trip) => attemptedAddressRef.current.add(trip.id));

    let cancelled = false;
    resolveMissingTripAddresses(pendingTrips)
      .then((resolved) => {
        if (!cancelled && resolved.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['trips'] });
        }
      })
      .catch((err) =>
        console.error('[TripLogs] Background address resolution failed:', err)
      );

    return () => {
      cancelled = true;
    };
  }, [pendingAddressKey, queryClient]);

  useEffect(() => {
    if (!pendingVehicleKey || vehicles.length === 0 || drivers.length === 0) return;

    const pendingTrips = tripsRef.current.filter(
      (trip) => !trip.vehicleId && !attemptedVehicleRef.current.has(trip.id)
    );
    if (pendingTrips.length === 0) return;

    pendingTrips.forEach((trip) => attemptedVehicleRef.current.add(trip.id));

    let cancelled = false;
    resolveMissingTripVehicles(pendingTrips, vehicles, drivers)
      .then((resolved) => {
        if (!cancelled && resolved.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['trips'] });
        }
      })
      .catch((err) =>
        console.error('[TripLogs] Background vehicle backfill failed:', err)
      );

    return () => {
      cancelled = true;
    };
  }, [pendingVehicleKey, queryClient, vehicles, drivers]);
}
