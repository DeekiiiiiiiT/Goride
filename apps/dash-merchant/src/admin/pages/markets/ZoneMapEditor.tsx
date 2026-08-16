/**
 * Leaflet map for Rush town coverage: view borders, cut out no-go areas, adjust delivery area.
 */
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Pencil, Trash2, Check, Crosshair, Scissors } from 'lucide-react';
import type { DashZoneKind, DashZoneVertex, CoverageCheckResult } from '../../services/dashAdminService';

const JAMAICA_CENTER: L.LatLngExpression = [18.0, -77.0];
const DEFAULT_ZOOM = 11;

export type ZoneMapUiMode = 'view' | 'cutout' | 'adjust';

export type ZoneMapOverlay = {
  id: string;
  kind: DashZoneKind;
  polygon: DashZoneVertex[];
  name?: string;
};

function ensureLeafletCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('leaflet-css')) return;
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
}

function fixLeafletIcon() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

function styleForKind(kind: DashZoneKind, dimmed = false): L.PathOptions {
  if (kind === 'exclude') {
    return {
      color: '#f87171',
      fillColor: '#ef4444',
      fillOpacity: dimmed ? 0.12 : 0.25,
      weight: 2,
      dashArray: '6 4',
    };
  }
  return {
    color: '#34d399',
    fillColor: '#10b981',
    fillOpacity: dimmed ? 0.12 : 0.22,
    weight: 2,
  };
}

export type ZoneMapEditorProps = {
  zones: ZoneMapOverlay[];
  uiMode: ZoneMapUiMode;
  /** Vertices being drawn/edited (cutout starts empty; adjust starts with delivery area). */
  initialPolygon?: DashZoneVertex[];
  /** When editing, hide this zone from the background overlays. */
  editingZoneId?: string | null;
  onSave: (polygon: DashZoneVertex[]) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  onTestPoint?: (lat: number, lng: number) => Promise<CoverageCheckResult>;
};

export function ZoneMapEditor({
  zones,
  uiMode,
  initialPolygon = [],
  editingZoneId = null,
  onSave,
  onCancel,
  saving,
  onTestPoint,
}: ZoneMapEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const polyRef = useRef<L.Polygon | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const testMarkerRef = useRef<L.Marker | null>(null);
  const verticesRef = useRef<DashZoneVertex[]>(
    initialPolygon.length >= 3 ? [...initialPolygon] : [...initialPolygon],
  );
  const interactionRef = useRef<'draw' | 'test'>('draw');
  const uiModeRef = useRef(uiMode);

  const [ready, setReady] = useState(false);
  const [vertexCount, setVertexCount] = useState(verticesRef.current.length);
  const [testActive, setTestActive] = useState(false);
  const [testResult, setTestResult] = useState<CoverageCheckResult | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  uiModeRef.current = uiMode;
  interactionRef.current = testActive ? 'test' : 'draw';

  const editKind: DashZoneKind = uiMode === 'cutout' ? 'exclude' : 'include';
  const drawing = uiMode === 'cutout' || uiMode === 'adjust';

  const syncEditPolygon = () => {
    const map = mapRef.current;
    if (!map) return;
    const verts = verticesRef.current;
    setVertexCount(verts.length);

    if (polyRef.current) {
      map.removeLayer(polyRef.current);
      polyRef.current = null;
    }
    for (const m of markersRef.current) map.removeLayer(m);
    markersRef.current = [];

    if (!drawing) return;

    if (verts.length >= 2) {
      const latlngs = verts.map((v) => [v.lat, v.lng] as L.LatLngExpression);
      polyRef.current = L.polygon(latlngs, styleForKind(editKind)).addTo(map);
    }

    verts.forEach((v, idx) => {
      const marker = L.marker([v.lat, v.lng], { draggable: true }).addTo(map);
      marker.on('drag', () => {
        const p = marker.getLatLng();
        verticesRef.current[idx] = { lat: p.lat, lng: p.lng };
        if (polyRef.current) {
          polyRef.current.setLatLngs(verticesRef.current.map((x) => [x.lat, x.lng]));
        }
      });
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        verticesRef.current[idx] = { lat: p.lat, lng: p.lng };
        syncEditPolygon();
      });
      marker.on('dblclick', (e) => {
        L.DomEvent.stopPropagation(e);
        if (verticesRef.current.length <= 3) return;
        verticesRef.current.splice(idx, 1);
        syncEditPolygon();
      });
      markersRef.current.push(marker);
    });
  };

  const syncOverlays = (fit = false) => {
    const map = mapRef.current;
    if (!map || !overlayRef.current) return;
    overlayRef.current.clearLayers();

    const bounds: L.LatLngExpression[] = [];
    for (const z of zones) {
      if (editingZoneId && z.id === editingZoneId) continue;
      if (!Array.isArray(z.polygon) || z.polygon.length < 3) continue;
      const latlngs = z.polygon.map((v) => [v.lat, v.lng] as L.LatLngExpression);
      L.polygon(latlngs, styleForKind(z.kind, drawing)).addTo(overlayRef.current);
      for (const ll of latlngs) bounds.push(ll);
    }
    if (fit && !drawing && bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.2));
    }
  };

  useEffect(() => {
    ensureLeafletCss();
    fixLeafletIcon();
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(JAMAICA_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    mapRef.current = map;
    overlayRef.current = L.layerGroup().addTo(map);

    verticesRef.current =
      initialPolygon.length > 0 ? [...initialPolygon] : [];
    syncOverlays(true);
    syncEditPolygon();

    if (verticesRef.current.length >= 3) {
      const bounds = L.latLngBounds(verticesRef.current.map((v) => [v.lat, v.lng]));
      map.fitBounds(bounds.pad(0.2));
    }

    map.on('click', async (e: L.LeafletMouseEvent) => {
      if (interactionRef.current === 'test') {
        if (!onTestPoint) return;
        const { lat, lng } = e.latlng;
        if (testMarkerRef.current) map.removeLayer(testMarkerRef.current);
        testMarkerRef.current = L.marker([lat, lng]).addTo(map);
        setTestBusy(true);
        try {
          const res = await onTestPoint(lat, lng);
          setTestResult(res);
        } catch {
          setTestResult({ inZone: false, reason: 'Check failed' });
        } finally {
          setTestBusy(false);
        }
        return;
      }
      if (uiModeRef.current !== 'cutout' && uiModeRef.current !== 'adjust') return;
      verticesRef.current = [...verticesRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }];
      syncEditPolygon();
    });

    setTimeout(() => map.invalidateSize(), 80);

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      polyRef.current = null;
      markersRef.current = [];
      testMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per editor instance
  }, [ready]);

  const zonesKey = zones
    .map((z) => `${z.id}:${z.kind}:${z.polygon.length}`)
    .join('|');

  useEffect(() => {
    if (!mapRef.current) return;
    verticesRef.current = initialPolygon.length > 0 ? [...initialPolygon] : [];
    setTestActive(false);
    setTestResult(null);
    syncOverlays(uiMode === 'view');
    syncEditPolygon();
    if (drawing && verticesRef.current.length >= 3) {
      const bounds = L.latLngBounds(verticesRef.current.map((v) => [v.lat, v.lng]));
      mapRef.current.fitBounds(bounds.pad(0.2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiMode, editingZoneId, zonesKey]);

  // Refresh dimmed overlays when zone geometry changes without remounting
  useEffect(() => {
    if (!mapRef.current || drawing) return;
    syncOverlays(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonesKey]);

  const clearPolygon = () => {
    verticesRef.current = [];
    setTestResult(null);
    if (testMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(testMarkerRef.current);
      testMarkerRef.current = null;
    }
    syncEditPolygon();
  };

  const handleSave = () => {
    if (verticesRef.current.length < 3) return;
    void onSave(verticesRef.current.map((v) => ({ lat: v.lat, lng: v.lng })));
  };

  const hint =
    uiMode === 'cutout'
      ? 'Click the map to mark where you don’t deliver · drag points to reshape'
      : uiMode === 'adjust'
        ? 'Drag points to reshape the town delivery area · double-click a point to remove'
        : 'Green is where you deliver. Red cutouts are where you don’t. Use Test pin to check an address.';

  return (
    <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/80 p-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {uiMode === 'cutout' ? (
            <Scissors className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <Pencil className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span>{hint}</span>
        </div>
        <div className="flex items-center gap-2">
          {onTestPoint && (
            <button
              type="button"
              onClick={() => {
                setTestActive((v) => !v);
                setTestResult(null);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs ${
                testActive
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
                  : 'border-slate-700 text-slate-300'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              {testActive ? 'Testing…' : 'Test pin'}
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full rounded-lg overflow-hidden border border-slate-800"
        style={{ height: '420px' }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          {drawing
            ? `${vertexCount} point${vertexCount === 1 ? '' : 's'} · ${
                uiMode === 'cutout' ? 'no-delivery cutout' : 'delivery area'
              }`
            : `${zones.filter((z) => z.kind === 'include').length ? 'Delivery area shown' : 'No delivery area'} · ${
                zones.filter((z) => z.kind === 'exclude').length
              } cutout${zones.filter((z) => z.kind === 'exclude').length === 1 ? '' : 's'}`}
          {testActive ? ' · click map to test coverage' : ''}
        </p>
        {drawing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearPolygon}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || vertexCount < 3}
              onClick={handleSave}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {saving
                ? 'Saving…'
                : uiMode === 'cutout'
                  ? 'Save cutout'
                  : 'Save delivery area'}
            </button>
          </div>
        )}
      </div>

      {(testBusy || testResult) && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            testResult?.inZone
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/40 bg-red-500/10 text-red-200'
          }`}
        >
          {testBusy
            ? 'Checking…'
            : testResult?.inZone
              ? `We deliver here${testResult.matchedInclude ? ` · ${testResult.matchedInclude.name}` : ''}`
              : `We don’t deliver here${testResult?.reason ? ` · ${testResult.reason}` : ''}`}
        </div>
      )}
    </div>
  );
}
