import React, { useEffect, useRef, useState } from 'react';
import { dropoffMarkerIcon, riderPickupMarkerIcon } from '@/lib/mapMarkerIcons';
import { loadGoogleMapsApi } from '@/services/locationService';

type LatLng = { lat: number; lng: number };

type Props = {
  pickup: LatLng;
  dropoff: LatLng;
  encodedPolyline?: string | null;
};

/** Static route map for the completed-trip summary screen. */
export function TripSummaryMap({ pickup, dropoff, encodedPolyline }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
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
          zoomControl: false,
          gestureHandling: 'none',
          clickableIcons: false,
        });

        const pickupLatLng = new google.maps.LatLng(pickup.lat, pickup.lng);
        const dropoffLatLng = new google.maps.LatLng(dropoff.lat, dropoff.lng);

        markers.push(
          new google.maps.Marker({
            map,
            position: pickupLatLng,
            title: 'Pickup',
            icon: riderPickupMarkerIcon(),
            zIndex: 2,
          }),
          new google.maps.Marker({
            map,
            position: dropoffLatLng,
            title: 'Drop-off',
            icon: dropoffMarkerIcon(),
            zIndex: 2,
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
            strokeColor: '#004ac6',
            strokeOpacity: 0.9,
            strokeWeight: 5,
          });
          for (const p of path) bounds.extend(p);
        }

        map.fitBounds(bounds, { top: 24, right: 24, bottom: 24, left: 24 });
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      for (const m of markers) m.setMap(null);
      polyline?.setMap(null);
    };
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, encodedPolyline]);

  if (status === 'error') {
    return (
      <div
        className="trip-summary-map trip-summary-map--fallback"
        role="img"
        aria-label="Route map unavailable"
      >
        <span className="trip-summary-map__fallback-text">Map preview unavailable</span>
      </div>
    );
  }

  return (
    <div className="trip-summary-map">
      {status === 'loading' && <div className="trip-summary-map__shimmer" aria-hidden />}
      <div ref={containerRef} className="trip-summary-map__canvas" aria-label="Trip route map" />
      <div className="trip-summary-map__gradient" aria-hidden />
    </div>
  );
}
