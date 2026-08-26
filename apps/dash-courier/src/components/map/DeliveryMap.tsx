import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { isValidMapCoord } from '@/utils/mapCoords';

const JAMAICA_CENTER: [number, number] = [18.0179, -76.8099];

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

export type DeliveryMapProps = {
  courierLat?: number | null;
  courierLng?: number | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationLabel?: string;
  routePolyline?: Array<{ lat: number; lng: number }>;
  height?: string;
  className?: string;
  /** When false, map is display-only (no pinch/drag). Default true. */
  interactive?: boolean;
};

/** Live Leaflet map for courier delivery / online home (pickup or dropoff destination). */
export function DeliveryMap({
  courierLat,
  courierLng,
  destinationLat,
  destinationLng,
  destinationLabel = 'Destination',
  routePolyline,
  height = '100%',
  className = '',
  interactive = true,
}: DeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const courierMarkerRef = useRef<L.CircleMarker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    if (!document.head.querySelector(`link[href="${link.href}"]`)) {
      document.head.appendChild(link);
    }
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      touchZoom: interactive,
    }).setView(JAMAICA_CENTER, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    const safeInvalidateSize = () => {
      if (mapInstanceRef.current !== map) return;
      try {
        map.invalidateSize({ animate: false });
      } catch {
        /* map torn down mid-frame */
      }
    };

    const el = mapContainerRef.current;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(safeInvalidateSize);
    });
    ro.observe(el);
    requestAnimationFrame(safeInvalidateSize);

    return () => {
      ro.disconnect();
      mapInstanceRef.current = null;
      courierMarkerRef.current = null;
      destMarkerRef.current = null;
      routeLayerRef.current = null;
      try {
        // Prevent _leaflet_pos crash from async resize/zoom callbacks after teardown.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any)._animatingZoom = false;
        map.stop();
        map.off();
        map.remove();
      } catch {
        /* ignore Leaflet teardown races */
      }
    };
  }, [isMounted, interactive]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (courierMarkerRef.current) {
      courierMarkerRef.current.remove();
      courierMarkerRef.current = null;
    }
    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    const hasCourier = isValidMapCoord(courierLat, courierLng);
    const hasDest = isValidMapCoord(destinationLat, destinationLng);
    const positions: [number, number][] = [];

    if (hasCourier) {
      const pos: [number, number] = [Number(courierLat), Number(courierLng)];
      positions.push(pos);
      courierMarkerRef.current = L.circleMarker(pos, {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: '#006c49',
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup('You');
    }

    if (hasDest) {
      const pos: [number, number] = [Number(destinationLat), Number(destinationLng)];
      positions.push(pos);
      destMarkerRef.current = L.marker(pos).addTo(map).bindPopup(destinationLabel);
    }

    if (hasCourier && hasDest) {
      const routePoints: [number, number][] =
        routePolyline && routePolyline.length >= 2
          ? routePolyline.map((p) => [p.lat, p.lng] as [number, number])
          : [
              [Number(courierLat), Number(courierLng)],
              [Number(destinationLat), Number(destinationLng)],
            ];
      routeLayerRef.current = L.polyline(routePoints, {
        color: '#10b981',
        weight: 4,
        opacity: 0.75,
      }).addTo(map);
    }

    if (positions.length === 1) {
      map.setView(positions[0], 15);
    } else if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [48, 48], maxZoom: 16 });
    } else {
      map.setView(JAMAICA_CENTER, 12);
    }

    requestAnimationFrame(() => {
      if (mapInstanceRef.current !== map) return;
      try {
        map.invalidateSize({ animate: false });
      } catch {
        /* ignore */
      }
    });
  }, [
    courierLat,
    courierLng,
    destinationLat,
    destinationLng,
    destinationLabel,
    routePolyline,
    isMounted,
  ]);

  if (!isMounted) {
    return (
      <div
        className={`bg-surface-variant flex items-center justify-center ${className}`}
        style={{ height, minHeight: height === '100%' ? undefined : height }}
        aria-hidden
      >
        <span className="text-sm text-on-surface-variant">Loading map…</span>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden bg-surface-variant ${className}`}
      style={{ height, minHeight: height === '100%' ? undefined : height, zIndex: 0 }}
    >
      <div ref={mapContainerRef} className="h-full w-full" style={{ minHeight: 0 }} />
    </div>
  );
}
