import { useState, useCallback, useEffect, useRef } from 'react';
import { readDriverGeolocationFix } from '../utils/nativeLocationAccess';
import {
  fuelLogNotificationBody,
  isFuelGeofencePromptEnabled,
  shouldPromptFuelLog,
} from '../utils/fuelGeofencePrompt';
import { evaluateFuelProximity, type FuelProximityStation } from '../utils/fuelProximity';

export interface GeoLocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  timestamp: number | null;
  error: string | null;
  loading: boolean;
  mock?: boolean;
}

type FuelGeoOptions = {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
};

export const useGeolocation = () => {
  const [state, setState] = useState<GeoLocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    timestamp: null,
    error: null,
    loading: false,
  });

  const getLocation = useCallback((options?: FuelGeoOptions) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    return readDriverGeolocationFix(options).then((fix) => {
      const nextState: GeoLocationState = {
        ...fix,
        loading: false,
      };
      setState(nextState);
      return nextState;
    });
  }, []);

  return { ...state, getLocation };
};

/**
 * Opt-in dwell watch: when flag is on and driver stops ≥60s inside a verified
 * station fence, surface a prompt (toast). Capacitor may not expose mock GPS —
 * mock is passed through when the platform sets it on the fix.
 */
export function useFuelGeofenceWatch(
  stations: FuelProximityStation[],
  onPrompt?: (station: { id: string; name: string }) => void,
) {
  const insideSinceRef = useRef<{ stationId: string; since: number } | null>(null);
  const promptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isFuelGeofencePromptEnabled()) return;
    if (!stations.length) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation?.watchPosition) return;

    let watchId: number | null = null;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const proximity = evaluateFuelProximity(lat, lng, stations);
        if (proximity.kind !== 'inside') {
          insideSinceRef.current = null;
          return;
        }
        const now = Date.now();
        if (!insideSinceRef.current || insideSinceRef.current.stationId !== proximity.station.id) {
          insideSinceRef.current = { stationId: proximity.station.id, since: now };
          return;
        }
        const stoppedForMs = now - insideSinceRef.current.since;
        if (
          shouldPromptFuelLog({
            stationId: proximity.station.id,
            stationName: proximity.station.name,
            stoppedForMs,
          }) &&
          promptedRef.current !== proximity.station.id
        ) {
          promptedRef.current = proximity.station.id;
          onPrompt?.({ id: proximity.station.id, name: proximity.station.name });
          try {
            // Soft prompt — native LocalNotifications optional later
            console.info('[fuelGeofence]', fuelLogNotificationBody(proximity.station.name));
          } catch {
            /* ignore */
          }
        }
      },
      () => {
        /* ignore watch errors */
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, [stations, onPrompt]);
}
