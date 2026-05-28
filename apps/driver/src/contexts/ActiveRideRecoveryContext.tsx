import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { ridesDriverActiveRide, ridesDriverGetRequest } from '../services/ridesDriverEdge';
import {
  isDriverActiveRideStatus,
  persistActiveRideId,
  readPersistedActiveRideId,
} from '../utils/driverActiveRideSession';

type ActiveRideRecoveryContextValue = {
  activeRide: RideRequestRow | null;
  setActiveRide: (ride: RideRequestRow | null) => void;
  recoveryLoaded: boolean;
  hasActiveRide: boolean;
};

const ActiveRideRecoveryContext = createContext<ActiveRideRecoveryContextValue>({
  activeRide: null,
  setActiveRide: () => {},
  recoveryLoaded: false,
  hasActiveRide: false,
});

export function ActiveRideRecoveryProvider({ children }: { children: React.ReactNode }) {
  const [activeRide, setActiveRideState] = useState<RideRequestRow | null>(null);
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);

  const setActiveRide = useCallback((ride: RideRequestRow | null) => {
    setActiveRideState(ride);
    persistActiveRideId(ride?.id ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const cachedId = readPersistedActiveRideId();
        if (cachedId) {
          try {
            const { ride } = await ridesDriverGetRequest(cachedId);
            if (!cancelled && isDriverActiveRideStatus(ride.status)) {
              setActiveRideState(ride);
              persistActiveRideId(ride.id);
              return;
            }
          } catch {
            persistActiveRideId(null);
          }
        }

        const { ride } = await ridesDriverActiveRide();
        if (!cancelled && ride && isDriverActiveRideStatus(ride.status)) {
          setActiveRideState(ride);
          persistActiveRideId(ride.id);
        }
      } catch (e) {
        console.warn('active ride recovery failed', e);
      } finally {
        if (!cancelled) setRecoveryLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ActiveRideRecoveryContext.Provider
      value={{
        activeRide,
        setActiveRide,
        recoveryLoaded,
        hasActiveRide: activeRide != null,
      }}
    >
      {children}
    </ActiveRideRecoveryContext.Provider>
  );
}

export function useActiveRideRecovery() {
  return useContext(ActiveRideRecoveryContext);
}
