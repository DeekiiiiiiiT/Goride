import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { DriverPresenceRow } from '../services/driverAdminService';
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

const STATUS_COLOR: Record<string, string> = {
  on_trip: '#a78bfa',
  online: '#34d399',
  offline: '#64748b',
};

function markerColor(status: string): string {
  return STATUS_COLOR[status] ?? STATUS_COLOR.offline;
}

type Props = {
  drivers: DriverPresenceRow[];
  selectedId?: string | null;
  onSelect?: (driverId: string) => void;
  height?: string;
};

export function DriverPresenceMap({
  drivers,
  selectedId,
  onSelect,
  height = '420px',
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.crossOrigin = '';
    document.head.appendChild(link);
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current).setView([18.0, -77.5], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, [isMounted]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const positions: [number, number][] = [];

    for (const d of drivers) {
      if (!isValidMapCoord(d.lat, d.lng)) continue;
      const lat = Number(d.lat);
      const lng = Number(d.lng);
      positions.push([lat, lng]);

      const label =
        d.display_name?.trim() ||
        d.email?.trim() ||
        d.phone?.trim() ||
        d.driver_id.slice(0, 8);
      const statusLabel =
        d.live_status === 'on_trip'
          ? `On trip · ${(d.trip_status ?? 'active').replace(/_/g, ' ')}`
          : d.live_status === 'online'
            ? 'Online'
            : 'Offline';

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:14px;height:14px;border-radius:50%;
          background:${markerColor(d.live_status)};
          border:2px solid ${selectedId === d.driver_id ? '#fff' : 'rgba(255,255,255,0.8)'};
          box-shadow:0 0 0 ${selectedId === d.driver_id ? '3px' : '1px'} rgba(0,0,0,0.35);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const marker = L.marker([lat, lng], { icon })
        .bindPopup(`<strong>${label}</strong><br/>${statusLabel}`)
        .addTo(layer);

      marker.on('click', () => onSelect?.(d.driver_id));
    }

    if (positions.length === 1) {
      map.setView(positions[0], 14);
    } else if (positions.length > 1) {
      const bounds = L.latLngBounds(positions);
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [drivers, selectedId, onSelect, isMounted]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const el = mapContainerRef.current;
    if (!map || !el) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(() => map.invalidateSize()));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMounted]);

  if (!isMounted) {
    return (
      <div
        className="rounded-lg bg-slate-900 flex items-center justify-center text-slate-500 text-sm"
        style={{ height }}
      >
        Loading map…
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border border-slate-800" style={{ height }}>
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
