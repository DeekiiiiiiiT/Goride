import { useState, useEffect, useRef } from 'react';
import type { RoutePoint } from '../types/tripSession';
import { calculateHaversineDistance } from '../utils/locationService';

interface UseTripTrackerReturn {
  route: RoutePoint[];
  isTracking: boolean;
  startTracking: () => void;
  stopTracking: () => void;
  resetRoute: () => void;
  setRoute: (route: RoutePoint[]) => void;
  currentLocation: RoutePoint | null;
  error: string | null;
}

const MIN_DISTANCE_CHANGE_KM = 0.01;

export function useTripTracker(): UseTripTrackerReturn {
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<RoutePoint | null>(null);

  const watchId = useRef<number | null>(null);
  const lastPointRef = useRef<RoutePoint | null>(null);

  useEffect(() => {
    if (route.length > 0) {
      lastPointRef.current = route[route.length - 1];
    } else {
      lastPointRef.current = null;
    }
  }, [route]);

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      return;
    }

    setIsTracking(true);
    setError(null);

    const id = navigator.geolocation.watchPosition(
      position => {
        const { latitude, longitude, accuracy, speed, heading } = position.coords;
        const timestamp = position.timestamp;

        const newPoint: RoutePoint = {
          lat: latitude,
          lon: longitude,
          timestamp,
          accuracy,
          speed,
          heading,
        };

        setCurrentLocation(newPoint);

        if (!lastPointRef.current) {
          setRoute(prev => [...prev, newPoint]);
          lastPointRef.current = newPoint;
        } else {
          const dist = calculateHaversineDistance(
            { lat: lastPointRef.current.lat, lon: lastPointRef.current.lon },
            { lat: newPoint.lat, lon: newPoint.lon },
          );

          if (dist >= MIN_DISTANCE_CHANGE_KM) {
            setRoute(prev => [...prev, newPoint]);
            lastPointRef.current = newPoint;
          }
        }
      },
      err => {
        console.error('Tracking error', err);
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000,
      },
    );

    watchId.current = id;
  };

  const stopTracking = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
  };

  const resetRoute = () => {
    setRoute([]);
    lastPointRef.current = null;
    setCurrentLocation(null);
  };

  useEffect(() => {
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  return {
    route,
    isTracking,
    startTracking,
    stopTracking,
    resetRoute,
    setRoute,
    currentLocation,
    error,
  };
}
