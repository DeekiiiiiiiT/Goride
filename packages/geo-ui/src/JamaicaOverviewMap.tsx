/**
 * Read-only Jamaica overview: parish foundations, town borders, cutouts.
 * Town markers prefer market/catalog centers; legacy town_pins are fallback only.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Satellite, X } from 'lucide-react';
import { loadPartnerMapsApi } from '@roam/location';
import type { DashOverviewCommunityShape, DashOverviewParishShape, DashOverviewTownShape, DashParishRow, DashZoneVertex } from '@roam/dash-admin-client';
import { groupRingsForOutline, shapeIntersectsView, type LatLngBox } from './overviewViewport';

type Props = {
  parishes: DashParishRow[];
  /** Simplified catalog rings. The full official border stays on the town editor. */
  shapes?: DashOverviewTownShape[];
  /** Simplified parish outlines. Falls back to the stored parish ring when missing. */
  parishShapes?: DashOverviewParishShape[];
  onClose: () => void;
  /** Toggle parish foundation polygons (default on). */
  showParishes?: boolean;
  /** Toggle town delivery / cutout polygons (default on; culled below zoom 10). */
  showTowns?: boolean;
  /** Admin3 outlines. Empty until the operator opts in. */
  communityShapes?: DashOverviewCommunityShape[];
  /** Loads community outlines once. The map does not refit when they arrive. */
  onLoadCommunities?: () => Promise<void>;
  /** modal covers the screen. inline sits in the page. */
  presentation?: 'modal' | 'inline';
  /** Opens the place when a border is clicked. */
  onPick?: (pcode: string) => void;
};

function foundationVerts(p: DashParishRow): DashZoneVertex[] {
  const poly = p.foundation_polygon ?? [];
  return poly.filter((v) => v && Number.isFinite(v.lat) && Number.isFinite(v.lng));
}

function parishRings(
  parish: DashParishRow,
  display?: DashOverviewParishShape,
): DashZoneVertex[][] {
  const simplified = (display?.rings ?? [])
    .filter((ring) => ring.kind !== 'exclude')
    .map((ring) => (ring.polygon ?? []).filter((v) => v && Number.isFinite(v.lat) && Number.isFinite(v.lng)))
    .filter((path) => path.length >= 3);
  if (simplified.length > 0) return simplified;
  const fallback = foundationVerts(parish);
  return fallback.length >= 3 ? [fallback] : [];
}

function viewBox(bounds: google.maps.LatLngBounds): LatLngBox {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  return { south: sw.lat(), north: ne.lat(), west: sw.lng(), east: ne.lng() };
}

const JAMAICA_CENTER = { lat: 18.15, lng: -77.3 };

function applyTownNames(show: boolean, names: HTMLElement[], markers: google.maps.Marker[]) {
  for (const el of names) el.style.display = show ? 'block' : 'none';
  for (const marker of markers) {
    const title = marker.getTitle() ?? '';
    if (!show || !title) {
      marker.setLabel(null);
      continue;
    }
    const text = title.length > 28 ? `${title.slice(0, 27)}…` : title;
    marker.setLabel({ text, color: '#0c4a6e', fontSize: '10px', fontWeight: '600' });
  }
}

type OverlayHandle = {
  setMap: (map: google.maps.Map | null) => void;
};

export function JamaicaOverviewMap({
  parishes,
  shapes = [],
  parishShapes = [],
  onClose,
  showParishes = true,
  showTowns = true,
  communityShapes = [],
  onLoadCommunities,
  presentation = 'modal',
  onPick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<OverlayHandle[]>([]);
  const townPolysRef = useRef<google.maps.Polygon[]>([]);
  const communityPolysRef = useRef<google.maps.Polygon[]>([]);
  const communityMarkersRef = useRef<google.maps.Marker[]>([]);
  const communityLoadRef = useRef<Promise<void> | null>(null);
  const nameNodesRef = useRef<HTMLElement[]>([]);
  const classicMarkersRef = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [layerParishes, setLayerParishes] = useState(showParishes);
  const [layerTowns, setLayerTowns] = useState(showTowns);
  const [layerCommunities, setLayerCommunities] = useState(false);
  const [communitiesLoading, setCommunitiesLoading] = useState(false);
  const [zoom, setZoom] = useState(9);

  useEffect(() => {
    setLayerParishes(showParishes);
  }, [showParishes]);
  useEffect(() => {
    setLayerTowns(showTowns);
  }, [showTowns]);

  useEffect(() => {
    if (presentation !== 'modal') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, presentation]);

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
      nameNodesRef.current = [];
      classicMarkersRef.current = [];

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
      const fitFromCenters = shapes.some(
        (s) => Number.isFinite(Number(s.center_lat)) && Number.isFinite(Number(s.center_lng)),
      );

      const addDot = (lat: number, lng: number, title: string) => {
        bounds.extend({ lat, lng });
        hasGeom = true;
        if (canUseAdvancedMarker && AdvancedMarkerCtor) {
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
          const dot = document.createElement('div');
          dot.style.cssText =
            'width:10px;height:10px;border-radius:50%;background:#38bdf8;border:1.5px solid #0c4a6e;';
          const label = document.createElement('div');
          label.textContent = title;
          label.style.cssText =
            'display:none;margin-top:2px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:600;color:#0c4a6e;background:rgba(255,255,255,0.92);padding:0 4px;border-radius:4px;';
          wrap.append(dot, label);
          nameNodesRef.current.push(label);
          const marker = new AdvancedMarkerCtor({
            map,
            position: { lat, lng },
            title,
            content: wrap,
          });
          overlaysRef.current.push({
            setMap: (m) => {
              marker.map = m;
            },
          });
          return;
        }
        const marker = new google.maps.Marker({
          map,
          position: { lat, lng },
          title,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: '#38bdf8',
            fillOpacity: 1,
            strokeColor: '#0c4a6e',
            strokeWeight: 1,
          },
        });
        classicMarkersRef.current.push(marker);
        overlaysRef.current.push(marker);
      };

      for (const parish of parishes) {
        if (layerParishes) {
          const display = parishShapes.find((s) => s.parish_id === parish.id);
          for (const foundation of parishRings(parish, display)) {
            if (!fitFromCenters) extend(foundation);
            const poly = new google.maps.Polygon({
              map,
              paths: foundation,
              strokeColor: '#c084fc',
              fillColor: '#9333ea',
              fillOpacity: 0.08,
              strokeWeight: 2.5,
              strokeOpacity: 0.95,
              clickable: Boolean(onPick),
              zIndex: 10,
            });
            if (onPick) {
              const pcode = parish.pcode || parish.id;
              poly.addListener('click', () => onPick(pcode));
            }
            overlaysRef.current.push(poly);
          }
        }

        const parishHasShapes = shapes.some((s) => s.parish_id === parish.id);
        if (!parishHasShapes) {
          for (const pin of parish.town_pins ?? []) {
            if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) continue;
            addDot(pin.lat, pin.lng, `${pin.name} · ${parish.name}`);
          }
        }
      }

      for (const shape of shapes) {
        const title = shape.parish_name ? `${shape.name} · ${shape.parish_name}` : shape.name;
        const lat = Number(shape.center_lat);
        const lng = Number(shape.center_lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) addDot(lat, lng, title);
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
      applyTownNames(layerTowns && z > 9, nameNodesRef.current, classicMarkersRef.current);
    })();

    return () => {
      cancelled = true;
      for (const o of overlaysRef.current) o.setMap(null);
      overlaysRef.current = [];
      nameNodesRef.current = [];
      classicMarkersRef.current = [];
    };
  }, [parishes, parishShapes, shapes, ready, layerParishes, layerTowns, onPick]);

  // Town borders are created only after zooming in, and only for towns on screen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const clearTowns = () => {
      for (const poly of townPolysRef.current) poly.setMap(null);
      townPolysRef.current = [];
    };

    const sync = () => {
      const z = map.getZoom() ?? 9;
      const show = layerTowns && z > 9;
      applyTownNames(show, nameNodesRef.current, classicMarkersRef.current);
      clearTowns();
      if (!show) return;
      const bounds = map.getBounds();
      if (!bounds) return;
      const view = viewBox(bounds);
      for (const shape of shapes) {
        const lat = Number(shape.center_lat);
        const lng = Number(shape.center_lng);
        const center = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        if (!shapeIntersectsView(shape.rings, center, view)) continue;
        const active = Boolean(shape.is_active);
        for (const ring of shape.rings ?? []) {
          const path = (ring.polygon ?? []).filter(
            (v) => v && Number.isFinite(v.lat) && Number.isFinite(v.lng),
          );
          if (path.length < 3) continue;
          const cutout = ring.kind === 'exclude';
          const poly = new google.maps.Polygon({
            map,
            paths: path,
            strokeColor: cutout ? '#f87171' : active ? '#34d399' : '#fbbf24',
            fillColor: cutout ? '#ef4444' : active ? '#10b981' : '#f59e0b',
            fillOpacity: cutout ? 0.28 : active ? 0.22 : 0.12,
            strokeWeight: active && !cutout ? 2.5 : 2,
            strokeOpacity: cutout ? 0.9 : 1,
            clickable: Boolean(onPick && shape.pcode),
            zIndex: cutout ? 40 : active ? 30 : 20,
          });
          if (onPick && shape.pcode && !cutout) {
            poly.addListener('click', () => onPick(shape.pcode as string));
          }
          townPolysRef.current.push(poly);
        }
      }
    };

    const listener = map.addListener('idle', sync);
    sync();
    return () => {
      google.maps.event.removeListener(listener);
      clearTowns();
    };
  }, [shapes, ready, layerTowns, onPick]);

  // Community lines are a reference layer: outline only, culled to the view, off until asked.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const clearCommunities = () => {
      for (const poly of communityPolysRef.current) poly.setMap(null);
      communityPolysRef.current = [];
      for (const marker of communityMarkersRef.current) marker.setMap(null);
      communityMarkersRef.current = [];
    };

    const sync = () => {
      clearCommunities();
      if (!layerCommunities) return;
      const z = map.getZoom() ?? 9;
      if (z < 12) return;
      const bounds = map.getBounds();
      if (!bounds) return;
      const view = viewBox(bounds);
      const onSatellite = mapType === 'hybrid';
      const showNames = z >= 13;

      for (const shape of communityShapes) {
        const lat = Number(shape.center_lat);
        const lng = Number(shape.center_lng);
        const center = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        if (!shapeIntersectsView(shape.rings, center, view)) continue;

        for (const paths of groupRingsForOutline(shape.rings)) {
          communityPolysRef.current.push(new google.maps.Polygon({
            map,
            paths,
            strokeColor: '#94a3b8',
            strokeOpacity: onSatellite ? 0.85 : 0.35,
            strokeWeight: 1,
            fillOpacity: 0,
            clickable: Boolean(onPick),
            zIndex: 1,
          }));
          const communityPoly = communityPolysRef.current[communityPolysRef.current.length - 1];
          if (onPick && communityPoly) communityPoly.addListener('click', () => onPick(shape.pcode));
        }

        if (!showNames || !center || !shape.name) continue;
        const text = shape.name.length > 28 ? `${shape.name.slice(0, 27)}…` : shape.name;
        communityMarkersRef.current.push(new google.maps.Marker({
          map,
          position: center,
          clickable: false,
          zIndex: 1,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 0,
            fillOpacity: 0,
            strokeOpacity: 0,
          },
          label: {
            text,
            color: onSatellite ? '#e2e8f0' : '#64748b',
            fontSize: '10px',
            fontWeight: '500',
          },
        }));
      }
    };

    const listener = map.addListener('idle', sync);
    sync();
    return () => {
      google.maps.event.removeListener(listener);
      clearCommunities();
    };
  }, [communityShapes, ready, layerCommunities, mapType, onPick]);

  const enableCommunities = () => {
    setLayerCommunities(true);
    if (communityShapes.length > 0 || !onLoadCommunities || communityLoadRef.current) return;
    setCommunitiesLoading(true);
    const pending = onLoadCommunities().finally(() => {
      setCommunitiesLoading(false);
      communityLoadRef.current = null;
    });
    communityLoadRef.current = pending;
  };

  const modal = presentation === 'modal';
  return (
    <div className={modal ? 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6' : 'relative'}>
      {modal ? (
        <button
          type="button"
          className="absolute inset-0 bg-black/75"
          aria-label="Close overview map"
          onClick={onClose}
        />
      ) : null}
      <div
        role={modal ? 'dialog' : 'region'}
        aria-modal={modal || undefined}
        aria-labelledby="jamaica-overview-title"
        className={modal
          ? 'relative z-10 flex w-full max-w-6xl max-h-[94vh] flex-col rounded-xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden'
          : 'flex w-full flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950'}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3 shrink-0">
          <div className="flex-1 min-w-0">
            <h3 id="jamaica-overview-title" className="font-semibold text-white truncate">
              Jamaica · overview map
            </h3>
            <p className="text-xs text-slate-300">
              Read-only view of every parish border, town delivery area, cutout, and town pin
              {layerCommunities ? ' · community lines are a reference only' : ''}
              {zoom <= 9 ? ' · zoom in to show town borders and names' : ''}
              {layerCommunities && zoom < 12 ? ' · zoom in to show community lines' : ''}
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
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={layerCommunities}
              onChange={(e) => {
                if (e.target.checked) enableCommunities();
                else setLayerCommunities(false);
              }}
              className="rounded border-slate-600"
            />
            Communities{zoom < 12 ? ' (zoom)' : ''}
            {communitiesLoading ? ' …' : ''}
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
          {modal ? (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-900"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        <div className="overflow-y-auto p-4 space-y-3 flex flex-col">
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
            <span className="inline-flex items-center gap-1.5 border-l border-slate-700 pl-3">
              <span className="w-2.5 h-2.5 rounded-sm border border-slate-400 bg-transparent" />
              Community (reference)
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
              className="w-full min-h-[420px] rounded-xl border border-slate-700 overflow-hidden"
              style={{ height: 'min(70vh, 640px)' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
