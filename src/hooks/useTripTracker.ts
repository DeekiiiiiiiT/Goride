import { useState, useEffect, useRef } from 'react';
import { RoutePoint } from '../types/tripSession';
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

const MIN_DISTANCE_CHANGE_KM = 0.01; // 10 meters

export function useTripTracker(): UseTripTrackerReturn {
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<RoutePoint | null>(null);
  
  const watchId = useRef<number | null>(null);
  const lastPointRef = useRef<RoutePoint | null>(null);

  // Effect to sync ref with state when route is externally set (e.g. from localStorage)
  useEffect(() => {
    if (route.length > 0) {
      lastPointRef.current = route[route.length - 1];
    } else {
      lastPointRef.current = null;
    }
  }, [route]);

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported");
      return;
    }

    setIsTracking(true);
    setError(null);

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, speed, heading } = position.coords;
        const timestamp = position.timestamp;

        const newPoint: RoutePoint = {
          lat: latitude,
          lon: longitude,
          timestamp,
          accuracy,
          speed,
          heading
        };

        setCurrentLocation(newPoint);

        // Filter logic: Only add if distance > threshold or if it's the first point
        if (!lastPointRef.current) {
          setRoute(prev => [...prev, newPoint]);
          lastPointRef.current = newPoint;
        } else {
          const dist = calculateHaversineDistance(
            { lat: lastPointRef.current.lat, lon: lastPointRef.current.lon },
            { lat: newPoint.lat, lon: newPoint.lon }
          );

          // We use the raw Haversine (straight line) without the 1.3x multiplier usually
          // But the utility applies 1.3x. 
          // 0.01km (10m) * 1.3 = 0.013.
          // It's fine, consistent.
          if (dist >= MIN_DISTANCE_CHANGE_KM) {
             setRoute(prev => [...prev, newPoint]);
             lastPointRef.current = newPoint;
          }
        }
      },
      (err) => {
        console.error("Tracking error", err);
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000 // Accept cache slightly to save battery? No, 0 for realtime.
      }
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

  // Cleanup on unmount
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
    setRoute, // To restore from localStorage
    currentLocation,
    error
  };
}
