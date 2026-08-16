/**
 * Google Maps ops editor for Rush town coverage:
 * Places search (in-town), satellite, adjust border, freehand + radius cutouts, test pin.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Crosshair,
  Loader2,
  MapPin,
  Pencil,
  Satellite,
  Scissors,
  Search,
  Trash2,
} from 'lucide-react';
import { getPlaceDetails, loadPartnerMapsApi, searchAddresses } from '@roam/location';
import type { AddressSuggestion } from '@roam/location';
import type { CoverageCheckResult, DashZoneKind, DashZoneVertex } from '../../services/dashAdminService';
import {
  circleToPolygon,
  pointInPolygon,
  polygonBounds,
  polygonCentroid,
  type GeoVertex,
} from './coverageGeo';
import {
  CoordinateEntryOverlay,
  type NamedBorderPoint,
} from './CoordinateEntryOverlay';

export type ZoneMapUiMode = 'view' | 'cutout' | 'adjust' | 'radius';

export type ZoneMapOverlay = {
  id: string;
  kind: DashZoneKind;
  polygon: DashZoneVertex[];
  name?: string;
  source?: string | null;
  center_lat?: number | null;
  center_lng?: number | null;
  radius_m?: number | null;
};

export type ZoneMapEditorProps = {
  zones: ZoneMapOverlay[];
  uiMode: ZoneMapUiMode;
  initialPolygon?: DashZoneVertex[];
  editingZoneId?: string | null;
  /** Town delivery polygons used to filter Places results. */
  townIncludePolygons: GeoVertex[][];
  onSave: (payload: {
    polygon: DashZoneVertex[];
    source?: 'manual' | 'radius';
    center_lat?: number;
    center_lng?: number;
    radius_m?: number;
    nameHint?: string;
  }) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  onTestPoint?: (lat: number, lng: number) => Promise<CoverageCheckResult>;
  mapHeight?: number;
  /** Enter radius mode from parent when a place is already selected externally */
  onRequestRadiusMode?: () => void;
  /** Which foundation layer is being edited (copy + save labels). */
  foundationScope?: 'town' | 'parish';
};

function styleForKind(kind: DashZoneKind, zoneId?: string): google.maps.PolygonOptions {
  if (kind === 'exclude') {
    return {
      strokeColor: '#f87171',
      fillColor: '#ef4444',
      fillOpacity: 0.28,
      strokeWeight: 2,
      strokeOpacity: 0.9,
    };
  }
  if (zoneId === 'parish-foundation') {
    return {
      strokeColor: '#38bdf8',
      fillColor: '#0ea5e9',
      fillOpacity: 0.16,
      strokeWeight: 2.5,
      strokeOpacity: 0.95,
    };
  }
  return {
    strokeColor: '#34d399',
    fillColor: '#10b981',
    fillOpacity: 0.22,
    strokeWeight: 2,
  };
}

function pathToVertices(path: google.maps.MVCArray<google.maps.LatLng>): DashZoneVertex[] {
  const out: DashZoneVertex[] = [];
  for (let i = 0; i < path.getLength(); i++) {
    const p = path.getAt(i);
    out.push({ lat: p.lat(), lng: p.lng() });
  }
  return out;
}

export function ZoneMapEditor({
  zones,
  uiMode,
  initialPolygon = [],
  editingZoneId = null,
  townIncludePolygons,
  onSave,
  onCancel,
  saving,
  onTestPoint,
  mapHeight = 520,
  foundationScope = 'town',
}: ZoneMapEditorProps) {
  const foundationNoun = foundationScope === 'parish' ? 'parish' : 'town';
  const foundationTitle =
    foundationScope === 'parish' ? 'parish foundation border' : 'town foundation border';
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayPolysRef = useRef<google.maps.Polygon[]>([]);
  const editPolyRef = useRef<google.maps.Polygon | null>(null);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const searchMarkerRef = useRef<google.maps.Marker | null>(null);
  const testMarkerRef = useRef<google.maps.Marker | null>(null);
  const radiusCircleRef = useRef<google.maps.Circle | null>(null);
  const verticesRef = useRef<DashZoneVertex[]>([...initialPolygon]);
  const uiModeRef = useRef(uiMode);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [vertexCount, setVertexCount] = useState(initialPolygon.length);
  const [editVertices, setEditVertices] = useState<DashZoneVertex[]>([...initialPolygon]);
  const [testActive, setTestActive] = useState(false);
  const [testResult, setTestResult] = useState<CoverageCheckResult | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  const [searchQ, setSearchQ] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchEmpty, setSearchEmpty] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const [showCoordOverlay, setShowCoordOverlay] = useState(false);
  const [namedPoints, setNamedPoints] = useState<NamedBorderPoint[]>([]);
  const [radiusM, setRadiusM] = useState(300);


  uiModeRef.current = uiMode;
  const drawing = uiMode === 'cutout' || uiMode === 'adjust';
  const editKind: DashZoneKind = uiMode === 'cutout' ? 'exclude' : 'include';

  const primaryInclude =
    townIncludePolygons.find((p) => p.length >= 3) ??
    zones.find((z) => z.kind === 'include' && z.polygon.length >= 3)?.polygon ??
    [];

  const clearOverlays = () => {
    for (const p of overlayPolysRef.current) p.setMap(null);
    overlayPolysRef.current = [];
  };

  const clearEditPoly = () => {
    if (editPolyRef.current) {
      editPolyRef.current.setMap(null);
      editPolyRef.current = null;
    }
  };

  const syncOverlays = () => {
    const map = mapRef.current;
    if (!map) return;
    clearOverlays();
    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;
    for (const z of zones) {
      if (editingZoneId && z.id === editingZoneId) continue;
      if (z.polygon.length < 3) continue;
      const path = z.polygon.map((v) => ({ lat: v.lat, lng: v.lng }));
      const poly = new google.maps.Polygon({
        paths: path,
        map,
        editable: false,
        draggable: false,
        ...styleForKind(z.kind, z.id),
        fillOpacity: drawing || uiMode === 'radius' ? 0.12 : styleForKind(z.kind, z.id).fillOpacity,
      });
      overlayPolysRef.current.push(poly);
      for (const v of path) {
        bounds.extend(v);
        hasBounds = true;
      }
    }
    if (hasBounds && uiMode === 'view') {
      map.fitBounds(bounds, 48);
    }
  };

  const syncEditPolygon = () => {
    const map = mapRef.current;
    if (!map) return;
    clearEditPoly();
    const verts = verticesRef.current;
    setVertexCount(verts.length);
    setEditVertices([...verts]);
    if (!drawing || verts.length < 2) return;
    const poly = new google.maps.Polygon({
      paths: verts.map((v) => ({ lat: v.lat, lng: v.lng })),
      map,
      editable: true,
      draggable: false,
      ...styleForKind(editKind, editingZoneId ?? undefined),
    });
    const syncFromPath = () => {
      const path = poly.getPath();
      verticesRef.current = pathToVertices(path);
      setVertexCount(verticesRef.current.length);
      setEditVertices([...verticesRef.current]);
    };
    const path = poly.getPath();
    path.addListener('set_at', syncFromPath);
    path.addListener('insert_at', syncFromPath);
    path.addListener('remove_at', syncFromPath);
    // Dragging vertices sometimes only settles on mouseup — keep ref in sync.
    poly.addListener('mouseup', syncFromPath);
    editPolyRef.current = poly;
  };

  const syncRadiusPreview = () => {
    const map = mapRef.current;
    if (!map) return;
    if (radiusCircleRef.current) {
      radiusCircleRef.current.setMap(null);
      radiusCircleRef.current = null;
    }
    if (uiMode !== 'radius' || !selectedPlace) return;
    radiusCircleRef.current = new google.maps.Circle({
      map,
      center: { lat: selectedPlace.lat, lng: selectedPlace.lng },
      radius: radiusM,
      strokeColor: '#f87171',
      fillColor: '#ef4444',
      fillOpacity: 0.25,
      strokeWeight: 2,
      editable: true,
    });
    radiusCircleRef.current.addListener('radius_changed', () => {
      const r = radiusCircleRef.current?.getRadius();
      if (r && Number.isFinite(r)) setRadiusM(Math.round(Math.min(1000, Math.max(100, r))));
    });
    radiusCircleRef.current.addListener('center_changed', () => {
      const c = radiusCircleRef.current?.getCenter();
      if (!c) return;
      setSelectedPlace((prev) =>
        prev ? { ...prev, lat: c.lat(), lng: c.lng() } : prev,
      );
    });
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadPartnerMapsApi();
        if (cancelled) return;
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Maps failed to load');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const center =
      polygonCentroid(primaryInclude) ??
      (initialPolygon.length ? polygonCentroid(initialPolygon) : null) ?? { lat: 18.0, lng: -77.0 };

    const map = new google.maps.Map(containerRef.current, {
      center,
      zoom: 13,
      mapTypeId: mapType,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
      gestureHandling: 'greedy',
    });
    mapRef.current = map;

    map.addListener('click', async (e: google.maps.MapMouseEvent) => {
      const latLng = e.latLng;
      if (!latLng) return;
      const lat = latLng.lat();
      const lng = latLng.lng();

      if (testActive) {
        if (!onTestPoint) return;
        if (testMarkerRef.current) testMarkerRef.current.setMap(null);
        testMarkerRef.current = new google.maps.Marker({ map, position: { lat, lng } });
        setTestBusy(true);
        try {
          setTestResult(await onTestPoint(lat, lng));
        } catch {
          setTestResult({ inZone: false, reason: 'Check failed' });
        } finally {
          setTestBusy(false);
        }
        return;
      }

      // Cutout draw only: click-to-add points. Adjust mode uses drag handles only —
      // click-to-add was rebuilding the polygon and wiping in-progress border edits.
      if (uiModeRef.current === 'cutout') {
        if (editPolyRef.current) {
          editPolyRef.current.getPath().push(new google.maps.LatLng(lat, lng));
          verticesRef.current = pathToVertices(editPolyRef.current.getPath());
          setVertexCount(verticesRef.current.length);
          setEditVertices([...verticesRef.current]);
        } else {
          verticesRef.current = [...verticesRef.current, { lat, lng }];
          syncEditPolygon();
        }
        return;
      }

      if (uiModeRef.current === 'view' || uiModeRef.current === 'radius') {
        const inside =
          townIncludePolygons.some((poly) => pointInPolygon(lat, lng, poly)) ||
          (primaryInclude.length >= 3 && pointInPolygon(lat, lng, primaryInclude));
        if (!inside && primaryInclude.length >= 3) return;
        setSelectedPlace({ lat, lng, label: 'Dropped pin' });
        if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
        searchMarkerRef.current = new google.maps.Marker({
          map,
          position: { lat, lng },
          title: 'Selected',
        });
      }
    });

    syncOverlays();
    verticesRef.current = [...initialPolygon];
    syncEditPolygon();

    return () => {
      if (clickListenerRef.current) {
        google.maps.event.removeListener(clickListenerRef.current);
      }
      clearOverlays();
      clearEditPoly();
      if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
      if (testMarkerRef.current) testMarkerRef.current.setMap(null);
      if (radiusCircleRef.current) radiusCircleRef.current.setMap(null);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    mapRef.current?.setMapTypeId(mapType);
  }, [mapType]);

  // Only re-seed the edit polygon when mode / zone target changes — not when
  // the parent refreshes zone lists (that was snapping borders back to default).
  useEffect(() => {
    if (!mapRef.current) return;
    verticesRef.current = [...initialPolygon];
    setEditVertices([...initialPolygon]);
    setTestActive(false);
    setTestResult(null);
    setShowCoordOverlay(false);
    syncOverlays();
    syncEditPolygon();
    syncRadiusPreview();
    if ((uiMode === 'cutout' || uiMode === 'adjust') && verticesRef.current.length >= 3) {
      const b = polygonBounds(verticesRef.current);
      if (b) {
        mapRef.current.fitBounds(
          new google.maps.LatLngBounds(
            { lat: b.south, lng: b.west },
            { lat: b.north, lng: b.east },
          ),
          48,
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiMode, editingZoneId]);

  // Keep background overlays in sync without resetting the in-progress edit.
  useEffect(() => {
    if (!mapRef.current) return;
    syncOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones.map((z) => `${z.id}:${z.polygon.length}`).join('|')]);

  useEffect(() => {
    syncRadiusPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlace, radiusM, uiMode]);

  const includeKey = primaryInclude.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');

  useEffect(() => {
    if (!searchQ.trim()) {
      setSuggestions([]);
      setSearchEmpty(false);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setSearchBusy(true);
        setSearchEmpty(false);
        try {
          const bounds = polygonBounds(primaryInclude);
          const center = polygonCentroid(primaryInclude);
          const raw = await searchAddresses(searchQ.trim(), {
            boundsBias: bounds ?? undefined,
            locationBias: center
              ? { lat: center.lat, lng: center.lng, radiusMeters: 10_000 }
              : undefined,
          });
          setSuggestions(raw.slice(0, 8));
          setSearchEmpty(raw.length === 0);
        } catch {
          setSuggestions([]);
          setSearchEmpty(true);
        } finally {
          setSearchBusy(false);
        }
      })();
    }, 280);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- includeKey captures polygon
  }, [searchQ, includeKey]);

  const selectSuggestion = async (s: AddressSuggestion) => {
    setSearchBusy(true);
    try {
      const details = await getPlaceDetails(s.placeId);
      const inside =
        townIncludePolygons.some((poly) => pointInPolygon(details.lat, details.lng, poly)) ||
        (primaryInclude.length >= 3 &&
          pointInPolygon(details.lat, details.lng, primaryInclude));
      if (!inside) {
        setSuggestions([]);
        setSearchEmpty(true);
        setSearchQ('');
        return;
      }
      setSelectedPlace({
        lat: details.lat,
        lng: details.lng,
        label: details.formattedAddress || s.description,
      });
      setSearchQ('');
      setSuggestions([]);
      const map = mapRef.current;
      if (map) {
        map.panTo({ lat: details.lat, lng: details.lng });
        map.setZoom(Math.max(map.getZoom() ?? 13, 15));
        if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
        searchMarkerRef.current = new google.maps.Marker({
          map,
          position: { lat: details.lat, lng: details.lng },
          title: details.formattedAddress || s.mainText,
        });
      }
    } catch {
      setSearchEmpty(true);
    } finally {
      setSearchBusy(false);
    }
  };

  const fitToCurrentEdit = () => {
    const map = mapRef.current;
    const verts = verticesRef.current;
    if (!map || verts.length === 0) return;
    if (verts.length === 1) {
      map.panTo({ lat: verts[0].lat, lng: verts[0].lng });
      map.setZoom(Math.max(map.getZoom() ?? 13, 14));
      return;
    }
    const b = polygonBounds(verts);
    if (b) {
      map.fitBounds(
        new google.maps.LatLngBounds(
          { lat: b.south, lng: b.west },
          { lat: b.north, lng: b.east },
        ),
        48,
      );
    }
  };

  const applyVerticesToMap = (verts: DashZoneVertex[], replace: boolean) => {
    if (replace) {
      verticesRef.current = verts;
    } else {
      verticesRef.current = [...verticesRef.current, ...verts];
    }
    setVertexCount(verticesRef.current.length);
    setEditVertices([...verticesRef.current]);
    syncEditPolygon();
    fitToCurrentEdit();
  };

  const applyNamedCoordinates = (points: NamedBorderPoint[]) => {
    setNamedPoints(points);
    applyVerticesToMap(
      points.map((p) => ({ lat: p.lat, lng: p.lng })),
      true,
    );
  };

  const clearDrawing = () => {
    verticesRef.current = [];
    setVertexCount(0);
    setEditVertices([]);
    setNamedPoints([]);
    syncEditPolygon();
  };

  const handleSavePolygon = () => {
    // Always read live path from the map — don't trust possibly stale refs after drags.
    if (editPolyRef.current) {
      verticesRef.current = pathToVertices(editPolyRef.current.getPath());
    }
    if (verticesRef.current.length < 3) return;
    void onSave({
      polygon: verticesRef.current.map((v) => ({ lat: v.lat, lng: v.lng })),
      source: 'manual',
    });
  };

  const handleSaveRadius = () => {
    if (!selectedPlace) return;
    const r = radiusCircleRef.current?.getRadius() ?? radiusM;
    const center = radiusCircleRef.current?.getCenter();
    const lat = center?.lat() ?? selectedPlace.lat;
    const lng = center?.lng() ?? selectedPlace.lng;
    const radius = Math.round(Math.min(1000, Math.max(100, r)));
    const polygon = circleToPolygon({ lat, lng }, radius);
    void onSave({
      polygon,
      source: 'radius',
      center_lat: lat,
      center_lng: lng,
      radius_m: radius,
      nameHint: selectedPlace.label,
    });
  };

  const hint =
    uiMode === 'radius'
      ? 'Search or drop a pin, set the radius, then save the non-delivery circle.'
      : uiMode === 'cutout'
        ? 'Click the map to add corners · drag handles to reshape · then Save non-delivery zone'
        : uiMode === 'adjust'
          ? `Drag the green handles to reshape the ${foundationTitle}. Use Enter coordinates for typed limits. Then Save ${foundationNoun} border.`
          : foundationScope === 'parish'
            ? 'Blue/green outline = parish foundation. Town borders shown for context. Customer delivery still uses town borders.'
            : 'Green = town border (foundation). Red = no delivery. Search inside the town or use Test pin.';

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
        {loadError}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 p-12 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading map…
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/80 p-3">
      <div className="relative flex flex-wrap items-start gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            type="search"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search places in this town…"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
          />
          {(suggestions.length > 0 || searchEmpty || searchBusy) && searchQ.trim() && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 shadow-xl overflow-hidden">
              {searchBusy && (
                <p className="px-3 py-2 text-xs text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Searching…
                </p>
              )}
              {!searchBusy && searchEmpty && (
                <p className="px-3 py-2 text-xs text-slate-400">
                  No places inside this town’s delivery area.
                </p>
              )}
              {!searchBusy &&
                suggestions.map((s) => (
                  <button
                    key={s.placeId}
                    type="button"
                    onClick={() => void selectSuggestion(s)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-900 border-b border-slate-800 last:border-0"
                  >
                    <span className="font-medium text-white">{s.mainText}</span>
                    {s.secondaryText ? (
                      <span className="block text-xs text-slate-500">{s.secondaryText}</span>
                    ) : null}
                  </button>
                ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMapType((t) => (t === 'roadmap' ? 'hybrid' : 'roadmap'))}
          className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs ${
            mapType === 'hybrid'
              ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
              : 'border-slate-700 text-slate-300'
          }`}
        >
          <Satellite className="w-3.5 h-3.5" />
          {mapType === 'hybrid' ? 'Satellite' : 'Streets'}
        </button>
        {onTestPoint && (
          <button
            type="button"
            onClick={() => {
              setTestActive((v) => !v);
              setTestResult(null);
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs ${
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

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        {uiMode === 'cutout' || uiMode === 'radius' ? (
          <Scissors className="w-3.5 h-3.5 text-red-400" />
        ) : (
          <Pencil className="w-3.5 h-3.5 text-emerald-400" />
        )}
        {hint}
      </p>

      {uiMode === 'view' && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 px-0.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70 border border-emerald-400/50" />
            {foundationScope === 'parish' ? 'Parish border (foundation)' : 'Town border (foundation)'}
          </span>
          {foundationScope === 'town' ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500/70 border border-red-400/50" />
              Non-delivery zone
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-500/50 border border-sky-400/40" />
              Town borders (context)
            </span>
          )}
        </div>
      )}

      {drawing && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-100">
            {uiMode === 'cutout'
              ? `Editing non-delivery zone · ${vertexCount} points — save or cancel when done`
              : `Editing ${foundationTitle} · ${vertexCount} points — save or cancel when done`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCoordOverlay(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-600 text-xs text-slate-200"
            >
              <MapPin className="w-3.5 h-3.5" />
              Enter coordinates
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg border border-slate-600 text-xs text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || vertexCount < 3}
              onClick={handleSavePolygon}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {saving
                ? 'Saving…'
                : uiMode === 'cutout'
                  ? 'Save non-delivery zone'
                  : `Save ${foundationNoun} border`}
            </button>
          </div>
        </div>
      )}

      <CoordinateEntryOverlay
        open={showCoordOverlay}
        onClose={() => setShowCoordOverlay(false)}
        vertices={editVertices}
        knownPoints={namedPoints.length > 0 ? namedPoints : undefined}
        onApply={applyNamedCoordinates}
      />

      {selectedPlace && uiMode !== 'adjust' && uiMode !== 'cutout' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          <MapPin className="w-3.5 h-3.5 text-emerald-400" />
          <span className="flex-1 min-w-0 truncate text-slate-200">{selectedPlace.label}</span>
          {uiMode === 'radius' ? (
            <>
              <label className="flex items-center gap-1 text-slate-400">
                Radius
                <input
                  type="range"
                  min={100}
                  max={1000}
                  step={25}
                  value={radiusM}
                  onChange={(e) => setRadiusM(Number(e.target.value))}
                  className="w-28"
                />
                <span className="text-slate-200 w-12">{radiusM}m</span>
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveRadius}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save non-delivery zone'}
              </button>
            </>
          ) : (
            <span className="text-slate-500">Use “Don’t deliver near here” to cut a circle</span>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full rounded-lg overflow-hidden border border-slate-800"
        style={{ height: `${mapHeight}px` }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          {drawing
            ? `${vertexCount} points · ${uiMode === 'cutout' ? 'non-delivery zone' : foundationTitle}`
            : uiMode === 'radius'
              ? `Radius non-delivery · ${radiusM}m`
              : foundationScope === 'parish'
                ? `${zones.some((z) => z.id === 'parish-foundation' && z.polygon.length >= 3) ? 'Parish border shown' : 'No parish border yet'} · towns as context`
                : `${zones.filter((z) => z.kind === 'include').length ? 'Town border shown' : 'No town border'} · ${
                    zones.filter((z) => z.kind === 'exclude').length
                  } non-delivery zone${zones.filter((z) => z.kind === 'exclude').length === 1 ? '' : 's'}`}
        </p>
        {drawing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearDrawing}
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
              onClick={handleSavePolygon}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {saving
                ? 'Saving…'
                : uiMode === 'cutout'
                  ? 'Save non-delivery zone'
                  : `Save ${foundationNoun} border`}
            </button>
          </div>
        )}
        {uiMode === 'radius' && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300"
          >
            Cancel
          </button>
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
