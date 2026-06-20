import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { CourierPresenceRow } from '@roam/types/courier';
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
  on_delivery: '#fbbf24',
  online: '#34d399',
  offline: '#64748b',
};

type Props = {
  couriers: CourierPresenceRow[];
  selectedId?: string | null;
  onSelect?: (courierId: string) => void;
  height?: string;
};

export function CourierPresenceMap({
  couriers,
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
    for (const c of couriers) {
      if (!isValidMapCoord(c.lat, c.lng)) continue;
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      positions.push([lat, lng]);
      const color = STATUS_COLOR[c.live_status] ?? STATUS_COLOR.offline;
      const marker = L.circleMarker([lat, lng], {
        radius: selectedId === c.courier_id ? 10 : 7,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: selectedId === c.courier_id ? 3 : 1,
      });
      marker.on('click', () => onSelect?.(c.courier_id));
      marker.addTo(layer);
    }
    if (positions.length === 1) {
      map.setView(positions[0], 13);
    } else if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], maxZoom: 14 });
    }
  }, [couriers, selectedId, onSelect]);

  return (
    <div
      ref={mapContainerRef}
      className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900"
      style={{ height, minHeight: height }}
    />
  );
}
