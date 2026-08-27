/**
 * Read-only Jamaica overview: parish foundations, town borders, cutouts.
 * Town markers prefer market/catalog centers; legacy town_pins are fallback only.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Satellite, X } from 'lucide-react';
import { loadPartnerMapsApi } from '@roam/location';
import type { DashParishRow, DashZoneVertex } from '@roam/dash-admin-client';

type Props = {
  parishes: DashParishRow[];
  onClose: () => void;
  /** Toggle parish foundation polygons (default on). */
  showParishes?: boolean;
  /** Toggle town delivery / cutout polygons (default on; culled below zoom 10). */
  showTowns?: boolean;
};

function foundationVerts(p: DashParishRow): DashZoneVertex[] {
  const poly = p.foundation_polygon ?? [];
  return poly.filter((v) => v && Number.isFinite(v.lat) && Number.isFinite(v.lng));
}

function includeZones(town: { zones?: Array<{ kind?: string; polygon?: DashZoneVertex[] }> }) {
  return (town.zones ?? []).filter(
    (z) => z.kind === 'include' && Array.isArray(z.polygon) && z.polygon.length >= 3,
  );
}

function excludeZones(town: { zones?: Array<{ kind?: string; polygon?: DashZoneVertex[] }> }) {
  return (town.zones ?? []).filter(
    (z) => z.kind === 'exclude' && Array.isArray(z.polygon) && z.polygon.length >= 3,
  );
}

function townMarkerPos(town: {
  name?: string;
  center_lat?: number | null;
  center_lng?: number | null;
  zones?: Array<{ kind?: string; polygon?: DashZoneVertex[]; center_lat?: number | null; center_lng?: number | null }>;
}): { lat: number; lng: number; name: string } | null {
  const name = String(town.name ?? 'Town');
  if (Number.isFinite(town.center_lat) && Number.isFinite(town.center_lng)) {
    return { lat: Number(town.center_lat), lng: Number(town.center_lng), name };
  }
  const inc = includeZones(town)[0];
  if (inc && Number.isFinite(inc.center_lat) && Number.isFinite(inc.center_lng)) {
    return { lat: Number(inc.center_lat), lng: Number(inc.center_lng), name };
  }
  const ring = inc?.polygon ?? [];
  if (ring.length >= 3) {
    let lat = 0;
    let lng = 0;
    for (const v of ring) {
      lat += v.lat;
      lng += v.lng;
    }
    return { lat: lat / ring.length, lng: lng / ring.length, name };
  }
  return null;
}

const JAMAICA_CENTER = { lat: 18.15, lng: -77.3 };

type OverlayHandle = {
  setMap: (map: google.maps.Map | null) => void;
};

export function JamaicaOverviewMap({
  parishes,
  onClose,
  showParishes = true,
  showTowns = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<OverlayHandle[]>([]);
  const townPolysRef = useRef<google.maps.Polygon[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [layerParishes, setLayerParishes] = useState(showParishes);
  const [layerTowns, setLayerTowns] = useState(showTowns);
  const [zoom, setZoom] = useState(9);

  useEffect(() => {
    setLayerParishes(showParishes);
  }, [showParishes]);
  useEffect(() => {
    setLayerTowns(showTowns);
  }, [showTowns]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadPartnerMapsApi();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Maps failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    // AdvancedMarkerElement requires a Cloud Console mapId — use when configured.
    const mapId =
      typeof import.meta !== 'undefined' &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_MAP_ID;

    mapRef.current = new google.maps.Map(containerRef.current, {
      center: JAMAICA_CENTER,
      zoom: 9,
      mapTypeId: 'roadmap',
      streetViewControl: false,
      fullscreenControl: true,
      mapTypeControl: false,
      gestureHandling: 'greedy',
      ...(mapId ? { mapId } : {}),
    });
    mapRef.current.addListener('zoom_changed', () => {
      const z = mapRef.current?.getZoom();
      if (typeof z === 'number') setZoom(z);
    });
    setZoom(mapRef.current.getZoom() ?? 9);
  }, [ready]);

  useEffect(() => {
    mapRef.current?.setMapTypeId(mapType);
  }, [mapType]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    void (async () => {
      for (const o of overlaysRef.current) o.setMap(null);
      overlaysRef.current = [];
      townPolysRef.current = [];

      const bounds = new google.maps.LatLngBounds();
      let hasGeom = false;

      const extend = (poly: DashZoneVertex[]) => {
        for (const v of poly) {
          bounds.extend(v);
          hasGeom = true;
        }
      };

      const mapId = map.get('mapId') as string | undefined;
      let AdvancedMarkerCtor: typeof google.maps.marker.AdvancedMarkerElement | null = null;
      if (mapId && google.maps.importLibrary) {
        try {
          // Dynamic import when mapId is present — AdvancedMarker requires it.
          const markerLib = (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary;
          AdvancedMarkerCtor = markerLib.AdvancedMarkerElement ?? null;
        } catch {
          AdvancedMarkerCtor = null;
        }
      }
      if (cancelled) return;
      const canUseAdvancedMarker = Boolean(mapId && AdvancedMarkerCtor);

      for (const parish of parishes) {
        if (layerParishes) {
          const foundation = foundationVerts(parish);
          if (foundation.length >= 3) {
            extend(foundation);
            const poly = new google.maps.Polygon({
              map,
              paths: foundation,
              strokeColor: '#c084fc',
              fillColor: '#9333ea',
              fillOpacity: 0.08,
              strokeWeight: 2.5,
              strokeOpacity: 0.95,
              clickable: false,
              zIndex: 10,
            });
            overlaysRef.current.push(poly);
          }
        }

        // Prefer catalog/market centers; legacy town_pins only when no market markers exist.
        const marketMarkers: Array<{ lat: number; lng: number; name: string }> = [];
        for (const town of parish.towns ?? []) {
          const pos = townMarkerPos(town);
          if (pos) marketMarkers.push(pos);
        }
        const markerSource =
          marketMarkers.length > 0
            ? marketMarkers
            : (parish.town_pins ?? [])
                .filter((pin) => Number.isFinite(pin.lat) && Number.isFinite(pin.lng))
                .map((pin) => ({
                  lat: pin.lat,
                  lng: pin.lng,
                  name: `${pin.name} (legacy pin)`,
                }));

        for (const pin of markerSource) {
          bounds.extend({ lat: pin.lat, lng: pin.lng });
          hasGeom = true;
          if (canUseAdvancedMarker && AdvancedMarkerCtor) {
            const el = document.createElement('div');
            el.style.cssText =
              'width:10px;height:10px;border-radius:50%;background:#38bdf8;border:1.5px solid #0c4a6e;';
            el.title = `${pin.name} (${parish.name})`;
            const marker = new AdvancedMarkerCtor({
              map,
              position: { lat: pin.lat, lng: pin.lng },
              title: `${pin.name} (${parish.name})`,
              content: el,
            });
            overlaysRef.current.push({
              setMap: (m) => {
                marker.map = m;
              },
            });
          } else {
            // Fallback: classic Marker until a Cloud mapId is configured (AdvancedMarker requires mapId).
            const marker = new google.maps.Marker({
              map,
              position: { lat: pin.lat, lng: pin.lng },
              title: `${pin.name} (${parish.name})`,
              label: {
                text: pin.name.length > 12 ? `${pin.name.slice(0, 11)}…` : pin.name,
                color: '#0c4a6e',
                fontSize: '10px',
                fontWeight: '600',
              },
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 5,
                fillColor: '#38bdf8',
                fillOpacity: 1,
                strokeColor: '#0c4a6e',
                strokeWeight: 1,
              },
            });
            overlaysRef.current.push(marker);
          }
        }

        if (layerTowns) {
          for (const town of parish.towns ?? []) {
            const active = Boolean(town.is_active);
            for (const z of includeZones(town)) {
              const path = (z.polygon ?? []).filter(
                (v) => Number.isFinite(v.lat) && Number.isFinite(v.lng),
              );
              if (path.length < 3) continue;
              extend(path);
              const poly = new google.maps.Polygon({
                map: null,
                paths: path,
                strokeColor: active ? '#34d399' : '#fbbf24',
                fillColor: active ? '#10b981' : '#f59e0b',
                fillOpacity: active ? 0.22 : 0.12,
                strokeWeight: active ? 2.5 : 2,
                strokeOpacity: 1,
                clickable: false,
                zIndex: active ? 30 : 20,
              });
              townPolysRef.current.push(poly);
              overlaysRef.current.push(poly);
            }
            for (const z of excludeZones(town)) {
              const path = (z.polygon ?? []).filter(
                (v) => Number.isFinite(v.lat) && Number.isFinite(v.lng),
              );
              if (path.length < 3) continue;
              extend(path);
              const poly = new google.maps.Polygon({
                map: null,
                paths: path,
                strokeColor: '#f87171',
                fillColor: '#ef4444',
                fillOpacity: 0.28,
                strokeWeight: 2,
                strokeOpacity: 0.9,
                clickable: false,
                zIndex: 40,
              });
              townPolysRef.current.push(poly);
              overlaysRef.current.push(poly);
            }
          }
        }
      }

      if (cancelled) return;

      if (hasGeom) {
        map.fitBounds(bounds, 48);
      } else {
        map.setCenter(JAMAICA_CENTER);
        map.setZoom(9);
      }

      const z = map.getZoom() ?? 9;
      setZoom(z);
      const showTownPolys = layerTowns && z > 9;
      for (const poly of townPolysRef.current) {
        poly.setMap(showTownPolys ? map : null);
      }
    })();

    return () => {
      cancelled = true;
      for (const o of overlaysRef.current) o.setMap(null);
      overlaysRef.current = [];
      townPolysRef.current = [];
    };
  }, [parishes, ready, layerParishes, layerTowns]);

  // Cull town polygons until zoomed in (zoom > 9).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const show = layerTowns && zoom > 9;
    for (const poly of townPolysRef.current) {
      poly.setMap(show ? map : null);
    }
  }, [zoom, layerTowns, parishes, ready, layerParishes]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/75"
        aria-label="Close overview map"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="jamaica-overview-title"
        className="relative z-10 flex w-full max-w-6xl max-h-[94vh] flex-col rounded-xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3 shrink-0">
          <div className="flex-1 min-w-0">
            <h3 id="jamaica-overview-title" className="font-semibold text-white truncate">
              Jamaica · overview map
            </h3>
            <p className="text-xs text-slate-300">
              Read-only view of every parish border, town delivery area, cutout, and town pin
              {zoom <= 9 ? ' · zoom in to show town polygons' : ''}
            </p>
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={layerParishes}
              onChange={(e) => setLayerParishes(e.target.checked)}
              className="rounded border-slate-600"
            />
            Parishes
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={layerTowns}
              onChange={(e) => setLayerTowns(e.target.checked)}
              className="rounded border-slate-600"
            />
            Towns{zoom <= 9 ? ' (zoom)' : ''}
          </label>
          <button
            type="button"
            onClick={() => setMapType((t) => (t === 'roadmap' ? 'hybrid' : 'roadmap'))}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
              mapType === 'hybrid'
                ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                : 'border-slate-500 text-slate-100'
            }`}
          >
            <Satellite className="w-3.5 h-3.5" />
            {mapType === 'hybrid' ? 'Satellite' : 'Streets'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-900"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col min-h-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-200 px-0.5">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-violet-400/90 border border-violet-300/70" />
              Parish foundation
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/90 border border-emerald-300/70" />
              Active town delivery
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/90 border border-amber-300/70" />
              Inactive town delivery
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-400/90 border border-red-300/70" />
              No-delivery cutout
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-900/60" />
              Town / city pin
            </span>
          </div>

          {loadError ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
              {loadError}
            </div>
          ) : !ready ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 p-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading map…
            </div>
          ) : (
            <div
              ref={containerRef}
              className="w-full flex-1 min-h-[420px] rounded-xl border border-slate-700 overflow-hidden"
              style={{ height: 'min(70vh, 640px)' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
