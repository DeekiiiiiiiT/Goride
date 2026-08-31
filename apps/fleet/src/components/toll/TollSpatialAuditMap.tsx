import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_TILES } from '../../utils/spatialNormalization';
import { Button } from '../ui/button';
import { Slider } from '../ui/slider';
import {
  Maximize2,
  Eye,
  EyeOff,
  Tag,
  Loader2,
  MapPin,
  AlertCircle,
  Move,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { TollPlaza } from '../../types/toll';

const DEFAULT_GEOFENCE_M = 200;

// ─── Leaflet icon fix ───────────────────────────────────────────────────────
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

// ─── Status color config ────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  verified:   { fill: '#22c55e', stroke: '#16a34a', label: 'Verified' },
  unverified: { fill: '#f59e0b', stroke: '#d97706', label: 'Unverified' },
  learnt:     { fill: '#3b82f6', stroke: '#2563eb', label: 'Learnt' },
};

function plazaRadiusM(plaza: TollPlaza): number {
  // 0 = use global default (same rule as detection)
  const r = plaza.geofenceRadius;
  if (r === 0 || r == null) return DEFAULT_GEOFENCE_M;
  return r;
}

function plazaIcon(colors: { fill: string; stroke: string }, selected: boolean, draggable: boolean) {
  const size = selected ? 18 : 16;
  const ring = selected ? `box-shadow:0 0 0 3px rgba(99,102,241,.45);` : '';
  const cursor = draggable ? 'cursor:grab;' : 'cursor:pointer;';
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${colors.fill};border:2px solid ${colors.stroke};${ring}${cursor}"></div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface TollSpatialAuditMapProps {
  plazas: TollPlaza[];
  loading: boolean;
  onSelectPlaza?: (plaza: TollPlaza) => void;
  /** Parent confirms then persists. Return false to snap marker back. */
  onPlazaMoved?: (
    id: string,
    location: { lat: number; lng: number },
  ) => boolean | void | Promise<boolean | void>;
  /** Persist geofence radius (meters). 0 = use global default. */
  onPlazaRadiusChange?: (id: string, radiusM: number) => void | Promise<void>;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function TollSpatialAuditMap({
  plazas,
  loading,
  onSelectPlaza,
  onPlazaMoved,
  onPlazaRadiusChange,
}: TollSpatialAuditMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapShellRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const geofenceGroupRef = useRef<L.LayerGroup | null>(null);
  const labelGroupRef = useRef<L.LayerGroup | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  /** Pixel height — do not rely on Tailwind-only h-[700px] (admin may miss fleet class scan). */
  const [mapPaneHeightPx, setMapPaneHeightPx] = useState(600);
  const [showGeofences, setShowGeofences] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [editPositions, setEditPositions] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Local draft while sliding — commit on pointer-up / value commit
  const [radiusDraft, setRadiusDraft] = useState<number | null>(null);

  const canEdit = !!(onPlazaMoved || onPlazaRadiusChange);

  // Plazas that have valid GPS
  const mappablePlazas = plazas.filter(
    (p) => p.location?.lat && p.location?.lng && p.location.lat !== 0 && p.location.lng !== 0
  );

  const selectedPlaza = selectedId
    ? mappablePlazas.find((p) => p.id === selectedId) || null
    : null;

  // Keep draft in sync when selection or saved radius changes
  useEffect(() => {
    if (!selectedPlaza) {
      setRadiusDraft(null);
      return;
    }
    setRadiusDraft(selectedPlaza.geofenceRadius ?? 0);
  }, [selectedPlaza?.id, selectedPlaza?.geofenceRadius]);

  // ── Inject Leaflet CSS ──────────────────────────────────────────────────
  useEffect(() => {
    // CSS comes from `import 'leaflet/dist/leaflet.css'` — no CDN / SRI.
    setIsMounted(true);
  }, []);

  // Size the map pane from layout (same approach as fuel SpatialIntegrityMap).
  useLayoutEffect(() => {
    const el = mapShellRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      setMapPaneHeightPx(Math.max(500, Math.min(860, window.innerHeight - 200)));
      return;
    }
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const available = window.innerHeight - rect.top - 24;
      setMapPaneHeightPx(Math.max(420, Math.min(860, Math.round(available))));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  // ── Initialize Map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

    const el = mapContainerRef.current;
    setMapError(null);

    let map: L.Map;
    try {
      fixLeafletIcon();
      map = L.map(el, {
        zoomControl: false,
        attributionControl: true,
      }).setView([18.1096, -77.2975], 10); // Jamaica center

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      L.tileLayer(MAP_TILES.LIGHT, {
        attribution: MAP_TILES.ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);

      const markerGroup = L.layerGroup().addTo(map);
      const geofenceGroup = L.layerGroup().addTo(map);
      const labelGroup = L.layerGroup().addTo(map);

      layerGroupRef.current = markerGroup;
      geofenceGroupRef.current = geofenceGroup;
      labelGroupRef.current = labelGroup;
      mapInstanceRef.current = map;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start map';
      console.error('[TollSpatialAuditMap] init failed:', e);
      setMapError(msg);
      return;
    }

    const invalidate = () => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        /* map may be tearing down */
      }
    };
    // Tab panels often report 0 size on the first paint — retry after layout.
    requestAnimationFrame(invalidate);
    const t1 = window.setTimeout(invalidate, 50);
    const t2 = window.setTimeout(invalidate, 250);

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => invalidate())
        : null;
    ro?.observe(el);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
      if (mapInstanceRef.current) {
        const m = mapInstanceRef.current;
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
        geofenceGroupRef.current = null;
        labelGroupRef.current = null;
        try {
          (m as any)._animatingZoom = false;
          m.stop();
          m.off();
          m.remove();
        } catch {
          // Swallow errors from Leaflet teardown
        }
      }
    };
  }, [isMounted]);

  useEffect(() => {
    const m = mapInstanceRef.current;
    if (!m) return;
    try {
      m.invalidateSize({ animate: false });
    } catch {
      /* ignore */
    }
  }, [mapPaneHeightPx]);

  // Stable refs for callbacks used inside Leaflet handlers
  const onSelectRef = useRef(onSelectPlaza);
  const onMovedRef = useRef(onPlazaMoved);
  const onRadiusRef = useRef(onPlazaRadiusChange);
  const editRef = useRef(editPositions);
  const selectedRef = useRef(selectedId);
  onSelectRef.current = onSelectPlaza;
  onMovedRef.current = onPlazaMoved;
  onRadiusRef.current = onPlazaRadiusChange;
  editRef.current = editPositions;
  selectedRef.current = selectedId;

  // ── Render markers ────────────────────────────────────────────────────
  const renderMarkers = useCallback(() => {
    const map = mapInstanceRef.current;
    const markerGroup = layerGroupRef.current;
    const geofenceGroup = geofenceGroupRef.current;
    const labelGroup = labelGroupRef.current;
    if (!map || !markerGroup || !geofenceGroup || !labelGroup) return;

    markerGroup.clearLayers();
    geofenceGroup.clearLayers();
    labelGroup.clearLayers();

    if (mappablePlazas.length === 0) return;

    const latLngs = mappablePlazas.map((p) => L.latLng(p.location.lat, p.location.lng));
    const bounds = L.latLngBounds(latLngs);
    const dragging = editRef.current && !!onMovedRef.current;

    mappablePlazas.forEach((plaza) => {
      const lat = plaza.location.lat;
      const lng = plaza.location.lng;
      const colors = STATUS_COLORS[plaza.status] || STATUS_COLORS.unverified;
      const displayRadius = plazaRadiusM(plaza);
      const isSelected = selectedRef.current === plaza.id;

      const latlng = L.latLng(lat, lng);

      const marker = L.marker(latlng, {
        icon: plazaIcon(colors, isSelected, dragging),
        draggable: dragging,
        autoPan: true,
        zIndexOffset: isSelected ? 500 : 0,
      }).addTo(markerGroup);

      const popupHtml = `
        <div style="min-width:180px; font-family:system-ui,sans-serif;">
          <div style="font-weight:700; font-size:13px; margin-bottom:4px; color:#1e293b;">
            ${plaza.name}
          </div>
          <div style="font-size:11px; color:#64748b; margin-bottom:2px;">
            ${plaza.highway || 'No highway'}
          </div>
          <div style="font-size:11px; color:#64748b; margin-bottom:6px;">
            ${plaza.direction} &middot; ${plaza.operator || '—'}
          </div>
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${colors.fill};"></span>
            <span style="font-size:10px; font-weight:600; color:${colors.stroke}; text-transform:uppercase;">${colors.label}</span>
          </div>
          <div style="font-size:10px; color:#94a3b8;">
            GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}<br/>
            Geofence: ${plaza.geofenceRadius === 0 || plaza.geofenceRadius == null ? `${DEFAULT_GEOFENCE_M}m (default)` : `${plaza.geofenceRadius}m`}
          </div>
          ${plaza.stats?.totalTransactions ? `<div style="font-size:10px; color:#94a3b8; margin-top:2px;">Transactions: ${plaza.stats.totalTransactions.toLocaleString()}</div>` : ''}
        </div>
      `;
      marker.bindPopup(popupHtml, { maxWidth: 260 });

      marker.on('click', () => {
        setSelectedId(plaza.id);
        onSelectRef.current?.(plaza);
      });

      if (dragging) {
        marker.on('dragend', async () => {
          const pos = marker.getLatLng();
          try {
            const result = await onMovedRef.current?.(plaza.id, { lat: pos.lat, lng: pos.lng });
            if (result === false) {
              marker.setLatLng([plaza.location.lat, plaza.location.lng]);
            }
          } catch {
            marker.setLatLng([plaza.location.lat, plaza.location.lng]);
          }
        });
      }

      // Preview radius: use draft when this plaza is selected
      const circleRadius =
        isSelected && radiusDraft != null
          ? (radiusDraft === 0 ? DEFAULT_GEOFENCE_M : radiusDraft)
          : displayRadius;

      L.circle(latlng, {
        radius: circleRadius,
        color: isSelected ? '#6366f1' : colors.stroke,
        fillColor: isSelected ? '#6366f1' : colors.fill,
        fillOpacity: isSelected ? 0.12 : 0.08,
        weight: isSelected ? 2 : 1.5,
        dashArray: '6 4',
      }).addTo(geofenceGroup);

      const labelIcon = L.divIcon({
        html: `<div style="white-space:nowrap; font-size:10px; font-weight:600; color:${colors.stroke}; text-shadow:0 1px 2px rgba(255,255,255,0.9); pointer-events:none;">${plaza.name}</div>`,
        className: '',
        iconAnchor: [0, -12],
      });
      L.marker(latlng, { icon: labelIcon, interactive: false }).addTo(labelGroup);
    });

    // Auto-fit only when nothing selected (avoid jumping while editing)
    if (!selectedRef.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
    try {
      map.invalidateSize({ animate: false });
    } catch {
      /* ignore */
    }
  }, [mappablePlazas, radiusDraft]);

  // Re-render markers when plazas, loading, edit mode, or selection change
  useEffect(() => {
    if (!loading) {
      renderMarkers();
    }
  }, [loading, renderMarkers, editPositions, selectedId]);

  // Toggle geofence visibility
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = geofenceGroupRef.current;
    if (!map || !group) return;
    if (showGeofences) {
      map.addLayer(group);
    } else {
      map.removeLayer(group);
    }
  }, [showGeofences]);

  // Toggle label visibility
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = labelGroupRef.current;
    if (!map || !group) return;
    if (showLabels) {
      map.addLayer(group);
    } else {
      map.removeLayer(group);
    }
  }, [showLabels]);

  // Fit all handler
  const handleFitAll = () => {
    const map = mapInstanceRef.current;
    if (!map || mappablePlazas.length === 0) return;
    const bounds = L.latLngBounds(mappablePlazas.map((p) => L.latLng(p.location.lat, p.location.lng)));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  };

  const commitRadius = async (value: number) => {
    if (!selectedPlaza || !onRadiusRef.current) return;
    const current = selectedPlaza.geofenceRadius ?? 0;
    if (value === current) return;
    await onRadiusRef.current(selectedPlaza.id, value);
  };

  // ── Stats ──────────────────────────────────────────────────────────────
  const verifiedCount = mappablePlazas.filter((p) => p.status === 'verified').length;
  const unverifiedCount = mappablePlazas.filter((p) => p.status === 'unverified').length;
  const learntCount = mappablePlazas.filter((p) => p.status === 'learnt').length;
  const avgRadius =
    mappablePlazas.length > 0
      ? Math.round(
          mappablePlazas.reduce((sum, p) => sum + plazaRadiusM(p), 0) / mappablePlazas.length
        )
      : 0;
  const unmappedCount = plazas.length - mappablePlazas.length;

  return (
    <div
      ref={mapShellRef}
      className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
      style={{ height: mapPaneHeightPx, minHeight: 420 }}
    >
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <span className="text-sm text-slate-500 font-medium">Loading toll plazas...</span>
          </div>
        </div>
      )}

      {/* Map container — fills the explicitly sized shell */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 z-0 bg-slate-200"
      />

      {mapError && (
        <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-slate-100 p-6">
          <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
            <p className="font-semibold text-slate-800">Map failed to load</p>
            <p className="mt-1 text-sm text-slate-600">{mapError}</p>
            <p className="mt-2 text-xs text-slate-400">
              Hard-refresh the page (Ctrl+Shift+R). Deploy is not required for localhost.
            </p>
          </div>
        </div>
      )}

      {/* ── Controls (top-left) ──────────────────────────────────────── */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-1.5 bg-white/90 backdrop-blur-sm shadow-md text-xs',
            showGeofences && 'ring-2 ring-indigo-300'
          )}
          onClick={() => setShowGeofences((v) => !v)}
          title={showGeofences ? 'Hide geofence circles' : 'Show geofence circles'}
        >
          {showGeofences ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          Geofences
        </Button>

        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-1.5 bg-white/90 backdrop-blur-sm shadow-md text-xs',
            showLabels && 'ring-2 ring-indigo-300'
          )}
          onClick={() => setShowLabels((v) => !v)}
          title={showLabels ? 'Hide labels' : 'Show labels'}
        >
          {showLabels ? <Tag className="h-3.5 w-3.5" /> : <Tag className="h-3.5 w-3.5 opacity-50" />}
          Labels
        </Button>

        {canEdit && onPlazaMoved && (
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 gap-1.5 bg-white/90 backdrop-blur-sm shadow-md text-xs',
              editPositions && 'ring-2 ring-amber-400 bg-amber-50'
            )}
            onClick={() => setEditPositions((v) => !v)}
            title={editPositions ? 'Lock plaza positions' : 'Drag markers to reposition plazas'}
          >
            <Move className="h-3.5 w-3.5" />
            {editPositions ? 'Editing…' : 'Edit positions'}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 bg-white/90 backdrop-blur-sm shadow-md text-xs"
          onClick={handleFitAll}
          title="Fit all plazas in view"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Fit All
        </Button>
      </div>

      {/* ── Stats panel (top-right) ──────────────────────────────────── */}
      <div className="absolute top-3 right-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-md p-3 min-w-[180px]">
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin className="h-3.5 w-3.5 text-indigo-600" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Plaza Stats</span>
        </div>
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-slate-500">On Map:</span>
            <span className="font-semibold text-slate-800">{mappablePlazas.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Verified:</span>
            <span className="font-semibold text-emerald-600">{verifiedCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Unverified:</span>
            <span className="font-semibold text-amber-600">{unverifiedCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Learnt:</span>
            <span className="font-semibold text-blue-600">{learntCount}</span>
          </div>
          <div className="border-t border-slate-200 my-1" />
          <div className="flex justify-between">
            <span className="text-slate-500">Avg Geofence:</span>
            <span className="font-semibold text-slate-700">{avgRadius}m</span>
          </div>
          {unmappedCount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">No GPS:</span>
              <span className="font-semibold text-red-500">{unmappedCount}</span>
            </div>
          )}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-slate-400 border-t border-slate-100 pt-2">
          Near-miss GPS diagnostics need trip GPS samples — coming later.
        </p>
      </div>

      {/* ── Selected plaza radius editor ─────────────────────────────── */}
      {selectedPlaza && onPlazaRadiusChange && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] w-[min(420px,calc(100%-1.5rem))] bg-white/95 backdrop-blur-sm rounded-lg border border-slate-200 shadow-lg p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{selectedPlaza.name}</p>
              <p className="text-[10px] text-slate-500">
                Geofence radius · 0 = global default ({DEFAULT_GEOFENCE_M}m)
              </p>
            </div>
            <span className="text-xs font-bold tabular-nums text-indigo-600 shrink-0">
              {radiusDraft === 0 || radiusDraft == null
                ? `Default (${DEFAULT_GEOFENCE_M}m)`
                : `${radiusDraft}m`}
            </span>
          </div>
          <Slider
            value={[radiusDraft ?? 0]}
            onValueChange={(vals: number[]) => setRadiusDraft(vals[0] ?? 0)}
            onValueCommit={(vals: number[]) => {
              void commitRadius(vals[0] ?? 0);
            }}
            min={0}
            max={500}
            step={5}
            className="[&_[data-slot=slider-range]]:bg-indigo-600 [&_[data-slot=slider-thumb]]:border-indigo-600"
          />
          <div className="flex justify-between mt-1 text-[10px] text-slate-400">
            <span>0 (default)</span>
            <span>500m</span>
          </div>
        </div>
      )}

      {/* ── Legend (bottom-left) ──────────────────────────────────────── */}
      <div className="absolute bottom-8 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-md p-3">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Legend</span>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 border border-emerald-600" />
            <span className="text-slate-600">Verified</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-amber-500 border border-amber-600" />
            <span className="text-slate-600">Unverified</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-blue-500 border border-blue-600" />
            <span className="text-slate-600">Learnt</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-slate-400"
            />
            <span className="text-slate-600">Geofence</span>
          </div>
        </div>
      </div>

      {/* ── Empty state (no GPS plazas) ──────────────────────────────── */}
      {!loading && mappablePlazas.length === 0 && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
          <div className="bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-lg p-8 text-center max-w-sm pointer-events-auto">
            <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h4 className="text-base font-semibold text-slate-700 mb-1">No Plazas to Map</h4>
            <p className="text-sm text-slate-500">
              {plazas.length === 0
                ? 'No toll plazas exist yet. Add plazas from the "All Toll Plazas" tab.'
                : `${plazas.length} plaza(s) exist but none have GPS coordinates. Edit a plaza to add latitude and longitude.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
