import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

export type LatLngPoint = { lat: number; lng: number };

type ExistingZone = {
  id: string;
  name: string;
  geojson?: Record<string, unknown> | null;
};

type Props = {
  points: LatLngPoint[];
  onChange: (points: LatLngPoint[]) => void;
  existingZones?: ExistingZone[];
  height?: string;
};

const DEFAULT_CENTER: L.LatLngExpression = [18.02, -76.81];
const DEFAULT_ZOOM = 11;

function ensureLeafletCss() {
  if (typeof document === 'undefined') return;
  if (document.querySelector('link[data-leaflet-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.setAttribute('data-leaflet-css', '1');
  document.head.appendChild(link);
}

function ringFromGeoJson(geo: Record<string, unknown> | null | undefined): [number, number][] | null {
  if (!geo) return null;
  const type = String(geo.type || '');
  if (type === 'Polygon') {
    const coords = geo.coordinates as number[][][] | undefined;
    const ring = coords?.[0];
    if (!ring?.length) return null;
    return ring.map(([lng, lat]) => [lat, lng] as [number, number]);
  }
  if (type === 'MultiPolygon') {
    const coords = geo.coordinates as number[][][][] | undefined;
    const ring = coords?.[0]?.[0];
    if (!ring?.length) return null;
    return ring.map(([lng, lat]) => [lat, lng] as [number, number]);
  }
  return null;
}

/** Click-to-draw polygon map for ops service / pricing zones (no raw GeoJSON UI). */
export function ZoneDrawMap({
  points,
  onChange,
  existingZones = [],
  height = '320px',
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawLayerRef = useRef<L.LayerGroup | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const onChangeRef = useRef(onChange);
  const pointsRef = useRef(points);
  const [mounted, setMounted] = useState(false);

  onChangeRef.current = onChange;
  pointsRef.current = points;

  useEffect(() => {
    ensureLeafletCss();
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { zoomControl: true }).setView(
      DEFAULT_CENTER,
      DEFAULT_ZOOM,
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    zonesLayerRef.current = L.layerGroup().addTo(map);
    drawLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      onChangeRef.current([
        ...pointsRef.current,
        { lat: e.latlng.lat, lng: e.latlng.lng },
      ]);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      drawLayerRef.current = null;
      zonesLayerRef.current = null;
    };
  }, [mounted]);

  useEffect(() => {
    const layer = zonesLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    for (const z of existingZones) {
      const ring = ringFromGeoJson(z.geojson ?? null);
      if (!ring || ring.length < 3) continue;
      const poly = L.polygon(ring, {
        color: '#94a3b8',
        weight: 1.5,
        fillColor: '#cbd5e1',
        fillOpacity: 0.25,
      }).bindTooltip(z.name);
      poly.addTo(layer);
      for (const p of ring) bounds.push(p);
    }
    if (bounds.length > 2 && points.length === 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [28, 28], maxZoom: 12 });
    }
  }, [existingZones, points.length]);

  useEffect(() => {
    const layer = drawLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (points.length === 0) return;

    for (const p of points) {
      L.circleMarker([p.lat, p.lng], {
        radius: 6,
        color: '#d97706',
        fillColor: '#f59e0b',
        fillOpacity: 1,
        weight: 2,
      }).addTo(layer);
    }

    if (points.length >= 2) {
      L.polyline(
        points.map((p) => [p.lat, p.lng] as [number, number]),
        { color: '#f59e0b', weight: 2, dashArray: '4 4' },
      ).addTo(layer);
    }

    if (points.length >= 3) {
      L.polygon(
        points.map((p) => [p.lat, p.lng] as [number, number]),
        {
          color: '#d97706',
          weight: 2,
          fillColor: '#fbbf24',
          fillOpacity: 0.35,
        },
      ).addTo(layer);
    }
  }, [points]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Click the map to drop corners. Need at least 3 points, then Save zone.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={points.length === 0}
            onClick={() => onChange(points.slice(0, -1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Undo point
          </button>
          <button
            type="button"
            disabled={points.length === 0}
            onClick={() => onChange([])}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Clear drawing
          </button>
        </div>
      </div>
      <div
        ref={mapContainerRef}
        className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
        style={{ height, minHeight: height }}
      />
      <p className="text-xs text-slate-500">
        {points.length === 0
          ? 'No area drawn yet'
          : points.length < 3
            ? `${points.length} point${points.length === 1 ? '' : 's'} — keep clicking`
            : `Area ready (${points.length} corners)`}
      </p>
    </div>
  );
}

export function pointsToPolygonGeoJson(points: LatLngPoint[]): Record<string, unknown> | null {
  if (points.length < 3) return null;
  const ring = points.map((p) => [p.lng, p.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}
