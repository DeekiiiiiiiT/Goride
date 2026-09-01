import { useState, useCallback } from 'react';
import { readDriverGeolocationFix } from '../utils/nativeLocationAccess';

export interface GeoLocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  timestamp: number | null;
  error: string | null;
  loading: boolean;
}

export const useGeolocation = () => {
  const [state, setState] = useState<GeoLocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    timestamp: null,
    error: null,
    loading: false,
  });

  const getLocation = useCallback((options?: PositionOptions) => {
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
