import { useEffect, useRef, useState } from 'react';
import { checkCourierPermission } from '@/lib/courierPermissions';
import { toast } from '@/lib/toast';
import { isCourierNativePlatform } from '@/capacitor-native';

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

    let cancelled = false;
    let watchId: number | string | undefined;
    let clearNative: (() => Promise<void>) | undefined;

    const onError = () => {
      setCoords(KINGSTON_FALLBACK);
      setTracking(false);
      if (!warnedRef.current) {
        warnedRef.current = true;
        toast.info('Using approximate location', 'Enable GPS for accurate routing.');
      }
    };

    const startWebWatch = () => {
      if (!navigator.geolocation) {
        onError();
        return;
      }
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled) return;
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setTracking(true);
        },
        onError,
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
      );
    };

    const startNativeWatch = async () => {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted' && perm.location !== 'limited') {
        onError();
        return;
      }
      watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 20000 },
        (pos, err) => {
          if (cancelled) return;
          if (err || !pos) {
            onError();
            return;
          }
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setTracking(true);
        },
      );
      clearNative = async () => {
        if (typeof watchId === 'string') {
          await Geolocation.clearWatch({ id: watchId });
        }
      };
    };

    void (async () => {
      const native = await isCourierNativePlatform();
      if (native) {
        await startNativeWatch();
        return;
      }
      const state = await checkCourierPermission('location');
      if (state === 'granted') startWebWatch();
      else onError();
    })();

    return () => {
      cancelled = true;
      if (clearNative) {
        void clearNative();
      } else if (typeof watchId === 'number') {
        navigator.geolocation.clearWatch(watchId);
      }
      setTracking(false);
    };
  }, [enabled]);

  return { coords, tracking };
}
