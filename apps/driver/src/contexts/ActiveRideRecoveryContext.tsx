import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { ridesDriverActiveRide, ridesDriverGetRequest } from '../services/ridesDriverEdge';
import {
  isDriverActiveRideStatus,
  isActiveTripUiSuppressed,
  clearSuppressActiveTripUi,
  persistActiveRideId,
  persistActiveRideSnapshot,
  readPersistedActiveRideId,
  readPersistedActiveRideSnapshot,
} from '../utils/driverActiveRideSession';
import { ROAM_EXIT_TRIP_UI_EVENT, ROAM_RECONNECTED_EVENT } from '../utils/networkReconnect';

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
  try {
    const { ride: mandatoryCashRide } = await ridesDriverActiveRide();
    if (
      mandatoryCashRide &&
      mandatoryCashRide.status === 'awaiting_cash_settlement' &&
      isDriverActiveRideStatus(mandatoryCashRide.status)
    ) {
      clearSuppressActiveTripUi();
      persistActiveRideId(mandatoryCashRide.id);
      persistActiveRideSnapshot(mandatoryCashRide);
      return mandatoryCashRide;
    }
  } catch {
    /* fall through */
  }

  if (isActiveTripUiSuppressed()) {
    return null;
  }

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
        if (
          snapshot &&
          isDriverActiveRideStatus(snapshot.status) &&
          !isActiveTripUiSuppressed() &&
          !cancelled
        ) {
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
    let removeCapListener: (() => void) | undefined;
    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void refreshActiveRide();
        });
        removeCapListener = () => void handle.remove();
      } catch {
        /* web / optional */
      }
    })();
    return () => removeCapListener?.();
  }, [refreshActiveRide]);

  useEffect(() => {
    const onReconnected = () => {
      void refreshActiveRide();
    };
    const onExitTripUi = () => {
      const snapshot = readPersistedActiveRideSnapshot();
      if (snapshot?.status === 'awaiting_cash_settlement') return;
      setActiveRideState(null);
      persistActiveRideId(null);
      persistActiveRideSnapshot(null);
    };
    window.addEventListener(ROAM_RECONNECTED_EVENT, onReconnected);
    window.addEventListener(ROAM_EXIT_TRIP_UI_EVENT, onExitTripUi);
    return () => {
      window.removeEventListener(ROAM_RECONNECTED_EVENT, onReconnected);
      window.removeEventListener(ROAM_EXIT_TRIP_UI_EVENT, onExitTripUi);
    };
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
