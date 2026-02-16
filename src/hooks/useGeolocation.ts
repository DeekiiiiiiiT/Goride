import { useState, useCallback } from 'react';

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
    return new Promise<GeoLocationState>((resolve, reject) => {
      if (!navigator.geolocation) {
        const errorState = { ...state, error: 'Geolocation not supported', loading: false };
        setState(errorState);
        resolve(errorState);
        return;
      }

      setState(prev => ({ ...prev, loading: true, error: null }));

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newState = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
            error: null,
            loading: false,
          };
          setState(newState);
          resolve(newState);
        },
        (error) => {
          let errorMessage = 'Failed to get location';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission denied';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information unavailable';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out';
              break;
          }
          const errorState = {
            lat: null,
            lng: null,
            accuracy: null,
            timestamp: null,
            error: errorMessage,
            loading: false,
          };
          setState(errorState);
          resolve(errorState);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
          ...options,
        }
      );
    });
  }, []);

  return { ...state, getLocation };
};
