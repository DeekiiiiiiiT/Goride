import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { MAP_TILES } from '../../utils/spatialNormalization';
import { Button } from '../ui/button';
import {
  Maximize2,
  Eye,
  EyeOff,
  Tag,
  Loader2,
  MapPin,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { TollPlaza } from '../../types/toll';

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
fixLeafletIcon();

// ─── Status color config ────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  verified:   { fill: '#22c55e', stroke: '#16a34a', label: 'Verified' },
  unverified: { fill: '#f59e0b', stroke: '#d97706', label: 'Unverified' },
  learnt:     { fill: '#3b82f6', stroke: '#2563eb', label: 'Learnt' },
};

// ─── Props ──────────────────────────────────────────────────────────────────
interface TollSpatialAuditMapProps {
  plazas: TollPlaza[];
  loading: boolean;
  onSelectPlaza?: (plaza: TollPlaza) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function TollSpatialAuditMap({ plazas, loading, onSelectPlaza }: TollSpatialAuditMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const geofenceGroupRef = useRef<L.LayerGroup | null>(null);
  const labelGroupRef = useRef<L.LayerGroup | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  const [showGeofences, setShowGeofences] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  // Plazas that have valid GPS
  const mappablePlazas = plazas.filter(
    (p) => p.location?.lat && p.location?.lng && p.location.lat !== 0 && p.location.lng !== 0
  );

  // ── Inject Leaflet CSS ──────────────────────────────────────────────────
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);

    setIsMounted(true);

    return () => {
      // Don't remove the link — other map components may share it
    };
  }, []);

  // ── Initialize Map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([18.1096, -77.2975], 10); // Jamaica center

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer(MAP_TILES.LIGHT, {
      attribution: MAP_TILES.ATTRIBUTION,
    }).addTo(map);

    const markerGroup = L.layerGroup().addTo(map);
    const geofenceGroup = L.layerGroup().addTo(map);
    const labelGroup = L.layerGroup().addTo(map);

    layerGroupRef.current = markerGroup;
    geofenceGroupRef.current = geofenceGroup;
    labelGroupRef.current = labelGroup;
    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        const m = mapInstanceRef.current;
        mapInstanceRef.current = null;
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

    const bounds = L.latLngBounds([]);

    mappablePlazas.forEach((plaza) => {
      const lat = plaza.location.lat;
      const lng = plaza.location.lng;
      const colors = STATUS_COLORS[plaza.status] || STATUS_COLORS.unverified;
      const radius = plaza.geofenceRadius || 200;

      const latlng = L.latLng(lat, lng);
      bounds.extend(latlng);

      // ─ Circle Marker (the pin) ─
      const marker = L.circleMarker(latlng, {
        radius: 8,
        fillColor: colors.fill,
        fillOpacity: 0.9,
        color: colors.stroke,
        weight: 2,
      }).addTo(markerGroup);

      // ─ Popup ─
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
            Geofence: ${radius}m
          </div>
          ${plaza.stats?.totalTransactions ? `<div style="font-size:10px; color:#94a3b8; margin-top:2px;">Transactions: ${plaza.stats.totalTransactions.toLocaleString()}</div>` : ''}
        </div>
      `;
      marker.bindPopup(popupHtml, { maxWidth: 260 });

      marker.on('click', () => {
        onSelectPlaza?.(plaza);
      });

      // ─ Geofence circle ─
      L.circle(latlng, {
        radius,
        color: colors.stroke,
        fillColor: colors.fill,
        fillOpacity: 0.08,
        weight: 1.5,
        dashArray: '6 4',
      }).addTo(geofenceGroup);

      // ─ Label (tooltip-style) ─
      const labelIcon = L.divIcon({
        html: `<div style="white-space:nowrap; font-size:10px; font-weight:600; color:${colors.stroke}; text-shadow:0 1px 2px rgba(255,255,255,0.9); pointer-events:none;">${plaza.name}</div>`,
        className: '',
        iconAnchor: [0, -12],
      });
      L.marker(latlng, { icon: labelIcon, interactive: false }).addTo(labelGroup);
    });

    // Auto-fit on first render
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [mappablePlazas, onSelectPlaza]);

  // Re-render markers when plazas or loading change
  useEffect(() => {
    if (!loading) {
      renderMarkers();
    }
  }, [loading, renderMarkers]);

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

  // ── Stats ──────────────────────────────────────────────────────────────
  const verifiedCount = mappablePlazas.filter((p) => p.status === 'verified').length;
  const unverifiedCount = mappablePlazas.filter((p) => p.status === 'unverified').length;
  const learntCount = mappablePlazas.filter((p) => p.status === 'learnt').length;
  const avgRadius =
    mappablePlazas.length > 0
      ? Math.round(
          mappablePlazas.reduce((sum, p) => sum + (p.geofenceRadius || 200), 0) / mappablePlazas.length
        )
      : 0;
  const unmappedCount = plazas.length - mappablePlazas.length;

  return (
    <div className="relative w-full h-full min-h-[500px]">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <span className="text-sm text-slate-500 font-medium">Loading toll plazas...</span>
          </div>
        </div>
      )}

      {/* Map container */}
      <div ref={mapContainerRef} className="w-full h-full rounded-lg" />

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
      </div>

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