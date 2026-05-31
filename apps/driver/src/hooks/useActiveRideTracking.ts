import { useCallback, useEffect, useRef, useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import {
  ridesDriverPostRideLocation,
  type DriverRideLocationLive,
} from '../services/ridesDriverEdge';
import { isRideLocationTrackingStatus, nextClientSeq } from '../utils/rideLocationSeq';

const DEFAULT_INTERVAL_SEC = 4;
const MAX_BACKOFF_MS = 30_000;

type TrackingState = {
  trackingError: string | null;
  gpsAccuracyM: number | null;
  isTracking: boolean;
};

export function useActiveRideTracking(
  activeRide: RideRequestRow | null,
  onRideUpdate?: (ride: RideRequestRow) => void,
  onLiveUpdate?: (live: DriverRideLocationLive | null) => void,
  intervalSeconds = DEFAULT_INTERVAL_SEC,
): TrackingState {
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  const clientSeqRef = useRef(0);
  const rideIdRef = useRef<string | null>(null);
  const backoffMsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const postFix = useCallback(
    async (coords: GeolocationCoordinates) => {
      if (!activeRide?.id) return;
      clientSeqRef.current = nextClientSeq(clientSeqRef.current);
      setGpsAccuracyM(coords.accuracy ?? null);

      try {
        const result = await ridesDriverPostRideLocation({
          ride_id: activeRide.id,
          lat: coords.latitude,
          lng: coords.longitude,
          heading_degrees: Number.isFinite(coords.heading) ? coords.heading : undefined,
          speed_mps: Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : undefined,
          accuracy_m: coords.accuracy ?? undefined,
          recorded_at: new Date().toISOString(),
          client_seq: clientSeqRef.current,
        });
        backoffMsRef.current = 0;
        setTrackingError(null);
        onLiveUpdate?.(result.live ?? null);
        if (result.ride) {
          rideIdRef.current = result.ride.id;
          onRideUpdate?.(result.ride);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Location upload failed';
        if (message.includes('rate_limited')) {
          backoffMsRef.current = Math.min(
            MAX_BACKOFF_MS,
            backoffMsRef.current ? backoffMsRef.current * 2 : 2000,
          );
        } else {
          setTrackingError('GPS updates paused — check connection and permissions');
        }
      }
    },
    [activeRide?.id, onRideUpdate, onLiveUpdate],
  );

  const sendImmediateFix = useCallback(() => {
    if (!navigator.geolocation || !activeRide?.id) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => void postFix(pos.coords),
      () => setTrackingError('Could not read GPS — enable location for this site'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }, [activeRide?.id, postFix]);

  useEffect(() => {
    if (!activeRide?.id || rideIdRef.current !== activeRide.id) {
      clientSeqRef.current = 0;
      rideIdRef.current = activeRide?.id ?? null;
      backoffMsRef.current = 0;
    }
  }, [activeRide?.id]);

  useEffect(() => {
    const shouldTrack = Boolean(
      activeRide?.id && isRideLocationTrackingStatus(activeRide.status),
    );

    if (!shouldTrack || !navigator.geolocation) {
      clearTimer();
      clearWatch();
      setIsTracking(false);
      return;
    }

    setIsTracking(true);
    sendImmediateFix();

    const intervalMs = Math.max(2000, intervalSeconds * 1000);

    const scheduleNext = () => {
      clearTimer();
      const delay = intervalMs + backoffMsRef.current;
      timerRef.current = window.setTimeout(() => {
        sendImmediateFix();
        scheduleNext();
      }, delay);
    };
    scheduleNext();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => void postFix(pos.coords),
      () => setTrackingError('Location permission needed during active trips'),
      { enableHighAccuracy: true, maximumAge: intervalMs, timeout: 15000 },
    );

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        sendImmediateFix();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimer();
      clearWatch();
      document.removeEventListener('visibilitychange', onVisible);
      setIsTracking(false);
    };
  }, [
    activeRide?.id,
    activeRide?.status,
    intervalSeconds,
    clearTimer,
    clearWatch,
    postFix,
    sendImmediateFix,
  ]);

  return { trackingError, gpsAccuracyM, isTracking };
}
