import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { RoutePoint } from '../../types/tripSession';

// Fix for Leaflet default marker icons in React
const fixLeafletIcon = () => {
  if (typeof window === 'undefined') return;
  
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  
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
}

export function LeafletMap({ height = "300px", route, currentLocation, startMarker, endMarker }: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const endMarkerRef = useRef<L.Marker | null>(null);
  const currentMarkerRef = useRef<L.Marker | null>(null);
  
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Inject Leaflet CSS from CDN
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);

    setIsMounted(true);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (isMounted && mapContainerRef.current && !mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView([51.505, -0.09], 13);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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

  // Keep map sized to its container (dialogs, viewport resize, flex layout)
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

  // Update Map Content
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing layers
    if (routeLayerRef.current) routeLayerRef.current.remove();
    if (startMarkerRef.current) startMarkerRef.current.remove();
    if (endMarkerRef.current) endMarkerRef.current.remove();
    if (currentMarkerRef.current) currentMarkerRef.current.remove();

    // 1. Draw Route
    if (route && route.length > 1) {
      const positions = route.map(p => [p.lat, p.lon] as [number, number]);
      routeLayerRef.current = L.polyline(positions, { color: '#4f46e5', weight: 4, opacity: 0.8 }).addTo(map);
      
      // Fit bounds to route
      const bounds = L.latLngBounds(positions);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }

    // 2. Start Marker
    let startPos: [number, number] | null = null;
    if (startMarker) {
        startPos = [startMarker.lat, startMarker.lon];
    } else if (route && route.length > 0) {
        startPos = [route[0].lat, route[0].lon];
    }

    if (startPos) {
        startMarkerRef.current = L.marker(startPos).addTo(map).bindPopup("Start");
    }

    // 3. End Marker
    let endPos: [number, number] | null = null;
    if (endMarker) {
        endPos = [endMarker.lat, endMarker.lon];
    } else if (route && route.length > 1 && !currentLocation) {
        const last = route[route.length - 1];
        endPos = [last.lat, last.lon];
    }

    if (endPos) {
        endMarkerRef.current = L.marker(endPos).addTo(map).bindPopup("End");
    }

    // 4. Current Location
    if (currentLocation) {
        currentMarkerRef.current = L.marker([currentLocation.lat, currentLocation.lon])
            .addTo(map)
            .bindPopup("Current Location");
            
        // If no route to fit bounds to, center on current location
        if (!route || route.length <= 1) {
            map.setView([currentLocation.lat, currentLocation.lon], 15);
        }
    } else if (!route || route.length === 0) {
        // Fallback view if nothing to show
        if (startPos) map.setView(startPos, 15);
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [route, currentLocation, startMarker, endMarker, isMounted]);

  if (!isMounted) {
    return (
      <div style={{ height, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.5rem' }}>
        <span className="text-slate-400 flex items-center gap-2">
            Loading Map...
        </span>
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
