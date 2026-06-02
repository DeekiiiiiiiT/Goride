import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { ridesDriverActiveRide, ridesDriverGetRequest } from '../services/ridesDriverEdge';
import {
  isDriverActiveRideStatus,
  persistActiveRideId,
  persistActiveRideSnapshot,
  readPersistedActiveRideId,
  readPersistedActiveRideSnapshot,
} from '../utils/driverActiveRideSession';
import { ROAM_RECONNECTED_EVENT } from '../utils/networkReconnect';

type ActiveRideRecoveryContextValue = {
  activeRide: RideRequestRow | null;
  setActiveRide: (ride: RideRequestRow | null) => void;
  recoveryLoaded: boolean;
  hasActiveRide: boolean;
  refreshActiveRide: () => Promise<void>;
};

const ActiveRideRecoveryContext = createContext<ActiveRideRecoveryContextValue>({
  activeRide: null,
  setActiveRide: () => {},
  recoveryLoaded: false,
  hasActiveRide: false,
  refreshActiveRide: async () => {},
});

async function fetchActiveRideFromServer(): Promise<RideRequestRow | null> {
  const cachedId = readPersistedActiveRideId();
  if (cachedId) {
    try {
      const { ride } = await ridesDriverGetRequest(cachedId);
      if (isDriverActiveRideStatus(ride.status)) {
        persistActiveRideId(ride.id);
        persistActiveRideSnapshot(ride);
        return ride;
      }
      persistActiveRideId(null);
      persistActiveRideSnapshot(null);
    } catch {
      /* fall through to active-ride endpoint or cache */
    }
  }

  try {
    const { ride } = await ridesDriverActiveRide();
    if (ride && isDriverActiveRideStatus(ride.status)) {
      persistActiveRideId(ride.id);
      persistActiveRideSnapshot(ride);
      return ride;
    }
  } catch {
    /* use local snapshot below */
  }

  const snapshot = readPersistedActiveRideSnapshot();
  if (snapshot && isDriverActiveRideStatus(snapshot.status)) {
    return snapshot;
  }

  persistActiveRideId(null);
  persistActiveRideSnapshot(null);
  return null;
}

export function ActiveRideRecoveryProvider({ children }: { children: React.ReactNode }) {
  const [activeRide, setActiveRideState] = useState<RideRequestRow | null>(null);
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);

  const setActiveRide = useCallback((ride: RideRequestRow | null) => {
    setActiveRideState(ride);
    persistActiveRideId(ride?.id ?? null);
    persistActiveRideSnapshot(ride);
  }, []);

  const refreshActiveRide = useCallback(async () => {
    const ride = await fetchActiveRideFromServer();
    setActiveRideState(ride);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const snapshot = readPersistedActiveRideSnapshot();
        if (snapshot && isDriverActiveRideStatus(snapshot.status) && !cancelled) {
          setActiveRideState(snapshot);
        }

        const ride = await fetchActiveRideFromServer();
        if (!cancelled) setActiveRideState(ride);
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

  useEffect(() => {
    const onReconnected = () => {
      void refreshActiveRide();
    };
    window.addEventListener(ROAM_RECONNECTED_EVENT, onReconnected);
    return () => window.removeEventListener(ROAM_RECONNECTED_EVENT, onReconnected);
  }, [refreshActiveRide]);

  return (
    <ActiveRideRecoveryContext.Provider
      value={{
        activeRide,
        setActiveRide,
        recoveryLoaded,
        hasActiveRide: activeRide != null,
        refreshActiveRide,
      }}
    >
      {children}
    </ActiveRideRecoveryContext.Provider>
  );
}

export function useActiveRideRecovery() {
  return useContext(ActiveRideRecoveryContext);
}
