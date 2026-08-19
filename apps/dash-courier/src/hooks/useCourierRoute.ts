import { useEffect, useRef, useState } from 'react';
import { fetchCourierRoute, type CourierRouteResponse } from '@/lib/courierApi';
import { decodeEncodedPolyline, type LatLng } from '@/lib/decodePolyline';

const POLL_MS = 30_000;

type UseCourierRouteArgs = {
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
  enabled?: boolean;
};

export function useCourierRoute({
  fromLat,
  fromLng,
  toLat,
  toLng,
  enabled = true,
}: UseCourierRouteArgs) {
  const [route, setRoute] = useState<CourierRouteResponse | null>(null);
  const [polyline, setPolyline] = useState<LatLng[]>([]);
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (!enabled) return;
    const hasFrom = fromLat != null && fromLng != null && Number.isFinite(fromLat) && Number.isFinite(fromLng);
    const hasTo = toLat != null && toLng != null && Number.isFinite(toLat) && Number.isFinite(toLng);
    if (!hasFrom || !hasTo) return;

    let cancelled = false;
    const key = `${fromLat!.toFixed(5)},${fromLng!.toFixed(5)}|${toLat!.toFixed(5)},${toLng!.toFixed(5)}`;

    const load = async () => {
      const res = await fetchCourierRoute({
        fromLat: fromLat!,
        fromLng: fromLng!,
        toLat: toLat!,
        toLng: toLng!,
      });
      if (cancelled || !res) return;
      setRoute(res);
      if (res.encodedPolyline) {
        setPolyline(decodeEncodedPolyline(res.encodedPolyline));
      } else {
        setPolyline([]);
      }
      lastKeyRef.current = key;
    };

    void load();
    const timer = window.setInterval(() => {
      if (lastKeyRef.current !== key) return;
      void load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, fromLat, fromLng, toLat, toLng]);

  const nextTurn = route?.nextTurn;
  const distanceKm = route?.distanceKm;
  const durationMinutes = route?.durationMinutes;

  return {
    route,
    polyline,
    nextTurnInstruction: nextTurn?.instruction,
    nextTurnDistanceM: nextTurn?.distanceM,
    distanceKm,
    durationMinutes,
  };
}
