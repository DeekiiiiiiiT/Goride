import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsApi } from '@/services/locationService';

type LatLng = { lat: number; lng: number };

type Props = {
  pickup: LatLng;
  dropoff: LatLng;
  encodedPolyline?: string | null;
  driverLocation?: LatLng | null;
  driverHeading?: number | null;
  statusLabel?: string;
};

export function LiveRideMap({
  pickup,
  dropoff,
  encodedPolyline,
  driverLocation,
  driverHeading,
  statusLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const markers: google.maps.Marker[] = [];
    let polyline: google.maps.Polyline | null = null;

    void (async () => {
      try {
        await loadGoogleMapsApi();
        if (cancelled || !containerRef.current) return;

        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        const geometryLib = (await google.maps.importLibrary('geometry')) as google.maps.GeometryLibrary;

        const map = new Map(containerRef.current, {
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'cooperative',
          clickableIcons: false,
        });
        mapRef.current = map;

        const pickupLatLng = new google.maps.LatLng(pickup.lat, pickup.lng);
        const dropoffLatLng = new google.maps.LatLng(dropoff.lat, dropoff.lng);

        markers.push(
          new google.maps.Marker({
            map,
            position: pickupLatLng,
            title: 'Pickup',
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#059669',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
          }),
          new google.maps.Marker({
            map,
            position: dropoffLatLng,
            title: 'Drop-off',
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#18181b',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
          }),
        );

        const bounds = new google.maps.LatLngBounds();
        bounds.extend(pickupLatLng);
        bounds.extend(dropoffLatLng);

        if (encodedPolyline) {
          const path = geometryLib.encoding.decodePath(encodedPolyline);
          polyline = new google.maps.Polyline({
            map,
            path,
            strokeColor: '#059669',
            strokeOpacity: 0.85,
            strokeWeight: 4,
          });
          for (const p of path) bounds.extend(p);
        }

        map.fitBounds(bounds, { top: 48, right: 28, bottom: 28, left: 28 });
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      for (const m of markers) m.setMap(null);
      polyline?.setMap(null);
      driverMarkerRef.current?.setMap(null);
      driverMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, encodedPolyline]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;

    if (!driverLocation) {
      driverMarkerRef.current?.setMap(null);
      driverMarkerRef.current = null;
      return;
    }

    const pos = new google.maps.LatLng(driverLocation.lat, driverLocation.lng);
    const rotation = driverHeading ?? 0;

    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new google.maps.Marker({
        map,
        position: pos,
        title: 'Driver',
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 5,
          fillColor: '#2563eb',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
          rotation,
        },
      });
    } else {
      driverMarkerRef.current.setPosition(pos);
      const icon = driverMarkerRef.current.getIcon();
      if (typeof icon === 'object' && icon) {
        driverMarkerRef.current.setIcon({ ...icon, rotation });
      }
    }
  }, [driverLocation?.lat, driverLocation?.lng, driverHeading, status]);

  if (status === 'error') {
    return (
      <div
        className="h-[38dvh] min-h-[180px] w-full flex items-center justify-center bg-zinc-100 text-sm text-zinc-500 rounded-b-3xl"
        role="img"
        aria-label="Live map unavailable"
      >
        Map unavailable
      </div>
    );
  }

  return (
    <div className="relative h-[38dvh] min-h-[180px] w-full overflow-hidden rounded-b-3xl">
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 bg-zinc-100 animate-pulse" aria-hidden />
      )}
      {statusLabel && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-zinc-800 shadow-md border border-zinc-200/80">
          {statusLabel}
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" aria-label="Live ride map" />
    </div>
  );
}
