import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

type StopPin = {
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
  stop_type?: string | null;
};

type Position = {
  lat: number;
  lng: number;
  heading?: number | null;
} | null;

type Props = {
  position: Position;
  stale: boolean;
  stops?: StopPin[];
  pickup?: { lat?: number | null; lng?: number | null; label?: string | null };
  dropoff?: { lat?: number | null; lng?: number | null; label?: string | null };
  height?: string;
};

function valid(lat?: number | null, lng?: number | null): lat is number {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  );
}

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

/** Ops live map for a selected dispatch job (poll parent owns data). */
export function JobLiveMap({
  position,
  stale,
  stops = [],
  pickup,
  dropoff,
  height = '240px',
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current).setView([18.0, -77.5], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerRef.current = null;
    };
  }, [isMounted]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];

    const addPin = (
      lat: number,
      lng: number,
      color: string,
      title: string,
      radius = 7,
    ) => {
      bounds.push([lat, lng]);
      L.circleMarker([lat, lng], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      })
        .bindTooltip(title)
        .addTo(layer);
    };

    if (valid(pickup?.lat, pickup?.lng)) {
      addPin(Number(pickup!.lat), Number(pickup!.lng), '#0ea5e9', pickup?.label || 'Pickup');
    }
    if (valid(dropoff?.lat, dropoff?.lng)) {
      addPin(Number(dropoff!.lat), Number(dropoff!.lng), '#f59e0b', dropoff?.label || 'Dropoff');
    }
    for (const s of stops) {
      if (!valid(s.lat, s.lng)) continue;
      if (
        pickup &&
        valid(pickup.lat, pickup.lng) &&
        Number(s.lat) === Number(pickup.lat) &&
        Number(s.lng) === Number(pickup.lng)
      ) {
        continue;
      }
      if (
        dropoff &&
        valid(dropoff.lat, dropoff.lng) &&
        Number(s.lat) === Number(dropoff.lat) &&
        Number(s.lng) === Number(dropoff.lng)
      ) {
        continue;
      }
      addPin(Number(s.lat), Number(s.lng), '#64748b', s.label || s.stop_type || 'Stop', 5);
    }

    if (position && valid(position.lat, position.lng)) {
      addPin(
        position.lat,
        position.lng,
        stale ? '#94a3b8' : '#22c55e',
        stale ? 'Driver (stale)' : 'Driver',
        10,
      );
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 14 });
    }
  }, [position, stale, stops, pickup, dropoff]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">Live tracking</p>
        {stale ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
            Stale / last known
          </span>
        ) : position ? (
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            Live
          </span>
        ) : (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            No GPS yet
          </span>
        )}
      </div>
      <div
        ref={mapContainerRef}
        className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
        style={{ height, minHeight: height }}
      />
    </div>
  );
}
