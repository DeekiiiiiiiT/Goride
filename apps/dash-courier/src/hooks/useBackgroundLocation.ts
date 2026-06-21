import { useEffect, useRef, useState } from 'react';
import { checkCourierPermission } from '@/lib/courierPermissions';
import { toast } from '@/lib/toast';

type LocationCoords = { lat: number; lng: number };

const KINGSTON_FALLBACK: LocationCoords = { lat: 18.0179, lng: -76.8099 };

export function useBackgroundLocation(enabled: boolean) {
  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [tracking, setTracking] = useState(false);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setTracking(false);
      return undefined;
    }

    let watchId: number | undefined;

    const startWatch = () => {
      if (!navigator.geolocation) {
        setCoords(KINGSTON_FALLBACK);
        setTracking(false);
        return;
      }

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setTracking(true);
        },
        () => {
          setCoords(KINGSTON_FALLBACK);
          setTracking(false);
          if (!warnedRef.current) {
            warnedRef.current = true;
            toast.info('Using approximate location', 'Enable GPS for accurate routing.');
          }
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
      );
    };

    void checkCourierPermission('location').then((state) => {
      if (state === 'granted') {
        startWatch();
      } else {
        setCoords(KINGSTON_FALLBACK);
        setTracking(false);
      }
    });

    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
      setTracking(false);
    };
  }, [enabled]);

  return { coords, tracking };
}
