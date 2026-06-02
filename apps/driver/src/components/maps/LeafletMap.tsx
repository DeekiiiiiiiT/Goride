import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { RoutePoint } from '../../types/tripSession';
import { isValidMapCoord } from '../../utils/mapCoords';

const fixLeafletIcon = () => {
  if (typeof window === 'undefined') return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
};

fixLeafletIcon();

interface LeafletMapProps {
  route: RoutePoint[];
  currentLocation?: RoutePoint | null;
  startMarker?: { lat: number; lon: number } | null;
  endMarker?: { lat: number; lon: number } | null;
  height?: string;
  routeColor?: string;
}

export function LeafletMap({
  height = '300px',
  route,
  currentLocation,
  startMarker,
  endMarker,
  routeColor = '#4f46e5',
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const endMarkerRef = useRef<L.Marker | null>(null);
  const currentMarkerRef = useRef<L.Marker | null>(null);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);

    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && mapContainerRef.current && !mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView([51.505, -0.09], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const el = mapContainerRef.current;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => map.invalidateSize());
    });
    ro.observe(el);
    requestAnimationFrame(() => map.invalidateSize());
    return () => ro.disconnect();
  }, [isMounted]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLayerRef.current) routeLayerRef.current.remove();
    if (startMarkerRef.current) startMarkerRef.current.remove();
    if (endMarkerRef.current) endMarkerRef.current.remove();
    if (currentMarkerRef.current) currentMarkerRef.current.remove();

    const validRoute = (route ?? []).filter((p) => isValidMapCoord(p.lat, p.lon));

    if (validRoute.length > 1) {
      const positions = validRoute.map((p) => [p.lat, p.lon] as [number, number]);
      routeLayerRef.current = L.polyline(positions, { color: routeColor, weight: 4, opacity: 0.8 }).addTo(map);

      const bounds = L.latLngBounds(positions);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }

    let startPos: [number, number] | null = null;
    if (startMarker && isValidMapCoord(startMarker.lat, startMarker.lon)) {
      startPos = [startMarker.lat, startMarker.lon];
    } else if (validRoute.length > 0) {
      startPos = [validRoute[0].lat, validRoute[0].lon];
    }

    if (startPos) {
      startMarkerRef.current = L.marker(startPos).addTo(map).bindPopup('Start');
    }

    let endPos: [number, number] | null = null;
    if (endMarker && isValidMapCoord(endMarker.lat, endMarker.lon)) {
      endPos = [endMarker.lat, endMarker.lon];
    } else if (validRoute.length > 1 && !currentLocation) {
      const last = validRoute[validRoute.length - 1];
      endPos = [last.lat, last.lon];
    }

    if (endPos) {
      endMarkerRef.current = L.marker(endPos).addTo(map).bindPopup('End');
    }

    if (currentLocation && isValidMapCoord(currentLocation.lat, currentLocation.lon)) {
      currentMarkerRef.current = L.marker([currentLocation.lat, currentLocation.lon])
        .addTo(map)
        .bindPopup('Current Location');

      if (validRoute.length <= 1) {
        map.setView([currentLocation.lat, currentLocation.lon], 15);
      }
    } else if (validRoute.length === 0) {
      if (startPos) map.setView(startPos, 15);
      else if (endPos) map.setView(endPos, 15);
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [route, currentLocation, startMarker, endMarker, routeColor, isMounted]);

  if (!isMounted) {
    return (
      <div
        style={{
          height,
          background: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '0.5rem',
        }}
      >
        <span className="flex items-center gap-2 text-slate-400">Loading Map...</span>
      </div>
    );
  }

  return (
    <div
      className="leaflet-map-root h-full min-h-0 w-full overflow-hidden rounded-lg"
      style={{ height, zIndex: 0 }}
    >
      <div ref={mapContainerRef} className="h-full min-h-0 w-full" style={{ minHeight: 0 }} />
    </div>
  );
}
