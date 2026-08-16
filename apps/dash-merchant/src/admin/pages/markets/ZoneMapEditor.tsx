/**
 * Leaflet map editor for Rush coverage polygons.
 * Click to add vertices; drag markers to reshape; Finish closes the ring.
 */
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Pencil, Trash2, Check, Crosshair } from 'lucide-react';
import type { DashZoneKind, DashZoneVertex, CoverageCheckResult } from '../../services/dashAdminService';

const JAMAICA_CENTER: L.LatLngExpression = [18.0, -77.0];
const DEFAULT_ZOOM = 11;

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

export type ZoneMapEditorProps = {
  initialPolygon?: DashZoneVertex[];
  kind: DashZoneKind;
  onKindChange?: (kind: DashZoneKind) => void;
  onSave: (polygon: DashZoneVertex[]) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  /** Optional live coverage test against active markets */
  onTestPoint?: (lat: number, lng: number) => Promise<CoverageCheckResult>;
};

export function ZoneMapEditor({
  initialPolygon = [],
  kind,
  onKindChange,
  onSave,
  onCancel,
  saving,
  onTestPoint,
}: ZoneMapEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polyRef = useRef<L.Polygon | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const testMarkerRef = useRef<L.Marker | null>(null);
  const verticesRef = useRef<DashZoneVertex[]>(
    initialPolygon.length >= 3 ? [...initialPolygon] : [],
  );
  const modeRef = useRef<'edit' | 'test'>('edit');

  const [ready, setReady] = useState(false);
  const [vertexCount, setVertexCount] = useState(verticesRef.current.length);
  const [mode, setMode] = useState<'edit' | 'test'>('edit');
  const [testResult, setTestResult] = useState<CoverageCheckResult | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  modeRef.current = mode;

  const polyStyle = (): L.PathOptions =>
    kind === 'exclude'
      ? { color: '#f87171', fillColor: '#ef4444', fillOpacity: 0.25, weight: 2, dashArray: '6 4' }
      : { color: '#34d399', fillColor: '#10b981', fillOpacity: 0.22, weight: 2 };

  const syncPolygon = () => {
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

    if (verts.length >= 2) {
      const latlngs = verts.map((v) => [v.lat, v.lng] as L.LatLngExpression);
      polyRef.current = L.polygon(latlngs, polyStyle()).addTo(map);
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
        syncPolygon();
      });
      marker.on('dblclick', (e) => {
        L.DomEvent.stopPropagation(e);
        if (verticesRef.current.length <= 3) return;
        verticesRef.current.splice(idx, 1);
        syncPolygon();
      });
      markersRef.current.push(marker);
    });
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

    verticesRef.current = initialPolygon.length >= 3 ? [...initialPolygon] : [];
    syncPolygon();

    if (verticesRef.current.length >= 3) {
      const bounds = L.latLngBounds(verticesRef.current.map((v) => [v.lat, v.lng]));
      map.fitBounds(bounds.pad(0.2));
    }

    map.on('click', async (e: L.LeafletMouseEvent) => {
      if (modeRef.current === 'test') {
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
      verticesRef.current = [...verticesRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }];
      syncPolygon();
    });

    setTimeout(() => map.invalidateSize(), 80);

    return () => {
      map.remove();
      mapRef.current = null;
      polyRef.current = null;
      markersRef.current = [];
      testMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per editor open
  }, [ready]);

  useEffect(() => {
    if (polyRef.current) polyRef.current.setStyle(polyStyle());
  }, [kind]);

  const clearPolygon = () => {
    verticesRef.current = [];
    setTestResult(null);
    if (testMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(testMarkerRef.current);
      testMarkerRef.current = null;
    }
    syncPolygon();
  };

  const handleSave = () => {
    if (verticesRef.current.length < 3) return;
    void onSave(verticesRef.current.map((v) => ({ lat: v.lat, lng: v.lng })));
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/80 p-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <Pencil className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            Click map to add points · drag markers to move · double-click marker to remove
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onKindChange && (
            <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => onKindChange('include')}
                className={`px-2.5 py-1.5 ${
                  kind === 'include' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400'
                }`}
              >
                Include
              </button>
              <button
                type="button"
                onClick={() => onKindChange('exclude')}
                className={`px-2.5 py-1.5 ${
                  kind === 'exclude' ? 'bg-red-500/20 text-red-300' : 'text-slate-400'
                }`}
              >
                Exclude
              </button>
            </div>
          )}
          {onTestPoint && (
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === 'test' ? 'edit' : 'test'));
                setTestResult(null);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs ${
                mode === 'test'
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
                  : 'border-slate-700 text-slate-300'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              {mode === 'test' ? 'Testing…' : 'Test pin'}
            </button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="w-full rounded-lg overflow-hidden border border-slate-800" style={{ height: '420px' }} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          {vertexCount} point{vertexCount === 1 ? '' : 's'}
          {kind === 'exclude' ? ' · exclude carve-out' : ' · include coverage'}
          {mode === 'test' ? ' · click map to test coverage' : ''}
        </p>
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
            {saving ? 'Saving…' : 'Save zone'}
          </button>
        </div>
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
              ? `In zone${testResult.matchedInclude ? ` · ${testResult.matchedInclude.name}` : ''}`
              : `Out of zone${testResult?.reason ? ` · ${testResult.reason}` : ''}`}
        </div>
      )}
    </div>
  );
}
