import React, { useEffect, useRef, useState } from 'react';
import { dropoffMarkerIcon, riderPickupMarkerIcon } from '@/lib/mapMarkerIcons';
import { loadGoogleMapsApi } from '@/services/locationService';

type LatLng = { lat: number; lng: number };

type Props = {
  pickup: LatLng;
  dropoff: LatLng;
  encodedPolyline?: string | null;
  variant?: 'card' | 'hero';
};

export function TripRouteMap({ pickup, dropoff, encodedPolyline, variant = 'card' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
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

        if (cancelled || !containerRef.current) return;

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
            icon: riderPickupMarkerIcon(),
          }),
          new google.maps.Marker({
            map,
            position: dropoffLatLng,
            title: 'Drop-off',
            icon: dropoffMarkerIcon(),
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
            strokeOpacity: 0.9,
            strokeWeight: 4,
          });
          for (const p of path) bounds.extend(p);
        } else {
          polyline = new google.maps.Polyline({
            map,
            path: [pickupLatLng, dropoffLatLng],
            strokeColor: '#a1a1aa',
            strokeOpacity: 0.8,
            strokeWeight: 3,
            geodesic: true,
          });
        }

        map.fitBounds(bounds, { top: 28, right: 28, bottom: 28, left: 28 });
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      for (const m of markers) m.setMap(null);
      polyline?.setMap(null);
      mapRef.current = null;
    };
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, encodedPolyline]);

  const isHero = variant === 'hero';

  if (status === 'error') {
    return (
      <div
        className={
          isHero
            ? 'flex h-full w-full items-center justify-center bg-zinc-100 text-sm text-zinc-500'
            : 'h-48 rounded-2xl border border-zinc-200 bg-zinc-50 flex items-center justify-center text-sm text-zinc-500'
        }
        role="img"
        aria-label="Route map unavailable"
      >
        Map unavailable
      </div>
    );
  }

  return (
    <div
      className={
        isHero
          ? 'relative h-full w-full overflow-hidden'
          : 'relative h-48 rounded-2xl overflow-hidden border border-zinc-200 ring-1 ring-zinc-100'
      }
    >
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 bg-zinc-100 animate-pulse" aria-hidden />
      )}
      <div ref={containerRef} className="h-full w-full" aria-label="Trip route map" />
    </div>
  );
}
