/**
 * Google Maps ops editor for Rush town coverage:
 * Places search (in-town), satellite, adjust border, freehand + radius cutouts, test pin.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Crosshair,
  Hand,
  Loader2,
  MapPin,
  Pencil,
  PencilLine,
  Satellite,
  Scissors,
  Search,
  Trash2,
  Undo2,
  CircleDot,
} from 'lucide-react';
import { getPlaceDetails, loadPartnerMapsApi, searchAddresses } from '@roam/location';
import type { AddressSuggestion } from '@roam/location';
import type { CoverageCheckResult, DashZoneKind, DashZoneVertex } from '@roam/dash-admin-client';
import { zonesToMapPolygons, type ActiveCoverageZone } from '@roam/dash-coverage';
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
import { HexCellsMapOverlay } from './HexCellsMapOverlay';

export type ZoneMapUiMode = 'view' | 'cutout' | 'adjust' | 'radius' | 'service';

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

export type ZoneMapContextTown = {
  id: string;
  name: string;
  polygon: DashZoneVertex[];
  isActive: boolean;
};

export type ZoneMapEditorProps = {
  zones: ZoneMapOverlay[];
  uiMode: ZoneMapUiMode;
  initialPolygon?: DashZoneVertex[];
  editingZoneId?: string | null;
  /** Town delivery polygons used to filter Places results. */
  townIncludePolygons: GeoVertex[][];
  /** Neighbor / parish sibling towns — reference only (never editable). */
  contextTownPolygons?: ZoneMapContextTown[];
  /** Published customer-facing zones (dashed live preview). */
  publishedZones?: ActiveCoverageZone[];
  /** Hide context layer toggle (parish map always shows context). */
  showNeighborToggle?: boolean;
  onSave: (payload: {
    polygon: DashZoneVertex[];
    source?: 'manual' | 'radius';
    center_lat?: number;
    center_lng?: number;
    radius_m?: number;
    nameHint?: string;
  }) => void | Promise<void>;
  onCancel: () => void;
  /** View mode: click an existing zone on the map to edit it. */
  onSelectZone?: (zoneId: string) => void;
  saving?: boolean;
  onTestPoint?: (lat: number, lng: number) => Promise<CoverageCheckResult>;
  mapHeight?: number;
  /** Fill parent height (expanded overlay) — map flexes so toolbars stay on-screen. */
  fillAvailableHeight?: boolean;
  /** Enter radius mode from parent when a place is already selected externally */
  onRequestRadiusMode?: () => void;
  /** Which foundation layer is being edited (copy + save labels). */
  foundationScope?: 'town' | 'parish';
  /** Reference town/city pins on parish map (Point GeoJSON import). */
  referenceTownPins?: Array<{ id: string; name: string; lat: number; lng: number }>;
  /** Open the lat/lng coordinate overlay immediately (e.g. from Edit coordinates). */
  autoOpenCoordinates?: boolean;
  /** Compiled H3 cells to overlay (include/exclude). */
  hexCells?: Array<{ h3_cell: string; kind: string }>;
  /** Where to render Streets / Hex / Test pin controls (default next to search). */
  mapToolsPlacement?: 'inline' | 'none';
  mapType?: 'roadmap' | 'hybrid';
  onMapTypeChange?: (next: 'roadmap' | 'hybrid') => void;
  showHexOverlay?: boolean;
  onShowHexOverlayChange?: (next: boolean) => void;
  testActive?: boolean;
  onTestActiveChange?: (next: boolean) => void;
};

function isServiceAreaSource(source?: string | null): boolean {
  const src = String(source ?? '').toLowerCase();
  return src === 'manual' || src === 'radius' || src === 'auto_outline';
}

/** Magenta — unused elsewhere on Markets maps (green/red/amber/violet/sky taken). */
const SERVICE_AREA_STROKE = '#e879f9';
const SERVICE_AREA_FILL = '#d946ef';

function styleForKind(
  kind: DashZoneKind,
  zoneId?: string,
  opts?: { contextOnly?: boolean; serviceArea?: boolean },
): google.maps.PolygonOptions {
  if (kind === 'exclude') {
    return {
      strokeColor: '#f87171',
      fillColor: '#ef4444',
      fillOpacity: 0.28,
      strokeWeight: 2,
      strokeOpacity: 0.9,
      zIndex: 40,
      clickable: false,
    };
  }
  if (zoneId === 'parish-foundation') {
    return {
      strokeColor: '#c084fc',
      fillColor: '#9333ea',
      fillOpacity: 0.1,
      strokeWeight: 3.5,
      strokeOpacity: 1,
      zIndex: 20,
      clickable: false,
    };
  }
  if (opts?.contextOnly) {
    // Official border — bright green, same thickness as before (not thicker).
    return {
      strokeColor: '#4ade80',
      fillColor: '#86efac',
      fillOpacity: 0.18,
      strokeWeight: 2,
      strokeOpacity: 1,
      zIndex: 15,
      clickable: false,
    };
  }
  if (opts?.serviceArea) {
    return {
      strokeColor: SERVICE_AREA_STROKE,
      fillColor: SERVICE_AREA_FILL,
      fillOpacity: 0.28,
      strokeWeight: 2.5,
      strokeOpacity: 1,
      zIndex: 35,
      clickable: false,
    };
  }
  return {
    strokeColor: '#34d399',
    fillColor: '#10b981',
    fillOpacity: 0.22,
    strokeWeight: 2.5,
    strokeOpacity: 1,
    zIndex: 30,
    clickable: false,
  };
}

function styleForContextTown(isActive: boolean): google.maps.PolygonOptions {
  // Amber reference towns — readable on terrain vs violet parish outline
  if (isActive) {
    return {
      strokeColor: '#fbbf24',
      fillColor: '#f59e0b',
      fillOpacity: 0.12,
      strokeWeight: 2.5,
      strokeOpacity: 1,
      clickable: false,
      zIndex: 10,
    };
  }
  return {
    strokeColor: '#d97706',
    fillColor: '#b45309',
    fillOpacity: 0.06,
    strokeWeight: 2,
    strokeOpacity: 0.9,
    clickable: false,
    zIndex: 5,
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

/** Rough meters between two lat/lng points (good enough for draw sampling). */
function metersBetween(a: DashZoneVertex, b: DashZoneVertex): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance from point P to segment AB in meters. */
function metersToSegment(p: DashZoneVertex, a: DashZoneVertex, b: DashZoneVertex): number {
  const ax = a.lng;
  const ay = a.lat;
  const bx = b.lng;
  const by = b.lat;
  const px = p.lng;
  const py = p.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return metersBetween(p, a);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return metersBetween(p, { lat: ay + t * dy, lng: ax + t * dx });
}

/**
 * Best place to insert a vertex on an existing ring (closed).
 * Returns path index for insertAt (after edge start).
 */
function nearestEdgeInsertIndex(
  point: DashZoneVertex,
  ring: DashZoneVertex[],
): { index: number; distM: number } | null {
  if (ring.length < 2) return null;
  let best: { index: number; distM: number } | null = null;
  const closed = ring.length >= 3;
  const edgeCount = closed ? ring.length : ring.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const distM = metersToSegment(point, a, b);
    if (!best || distM < best.distM) {
      best = { index: i + 1, distM };
    }
  }
  return best;
}

/** Freehand sample spacing — denser outline without flooding the path. */
const FREEHAND_MIN_M = 14;
const CLICK_DEDUPE_M = 4;
/** Click must be this close to a side to insert (vs append at the end). */
const INSERT_EDGE_MAX_M = 180;
/** Right-click / Remove tool: hit radius in screen pixels (zoom-independent). */
const DELETE_VERTEX_MAX_PX = 28;

function latLngToContainerPx(
  map: google.maps.Map,
  lat: number,
  lng: number,
): { x: number; y: number } | null {
  const bounds = map.getBounds();
  const div = map.getDiv();
  if (!bounds || !div.offsetWidth || !div.offsetHeight) return null;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const west = sw.lng();
  let east = ne.lng();
  if (east < west) east += 360;
  let xLng = lng;
  if (xLng < west) xLng += 360;
  const latSpan = ne.lat() - sw.lat();
  if (Math.abs(latSpan) < 1e-12) return null;
  const x = ((xLng - west) / (east - west)) * div.offsetWidth;
  const y = ((ne.lat() - lat) / latSpan) * div.offsetHeight;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function nearestVertexIndexByPixels(
  map: google.maps.Map,
  lat: number,
  lng: number,
  ring: DashZoneVertex[],
  maxPx: number,
): number {
  const click = latLngToContainerPx(map, lat, lng);
  if (!click || ring.length === 0) return -1;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const px = latLngToContainerPx(map, ring[i].lat, ring[i].lng);
    if (!px) continue;
    const d = Math.hypot(px.x - click.x, px.y - click.y);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestDist <= maxPx ? bestIdx : -1;
}

export function ZoneMapEditor({
  zones,
  uiMode,
  initialPolygon = [],
  editingZoneId = null,
  townIncludePolygons,
  contextTownPolygons = [],
  publishedZones = [],
  showNeighborToggle = true,
  onSave,
  onCancel,
  onSelectZone,
  saving,
  onTestPoint,
  mapHeight = 520,
  fillAvailableHeight = false,
  foundationScope = 'town',
  referenceTownPins = [],
  autoOpenCoordinates = false,
  hexCells = [],
  mapToolsPlacement = 'inline',
  mapType: mapTypeProp,
  onMapTypeChange,
  showHexOverlay: showHexOverlayProp,
  onShowHexOverlayChange,
  testActive: testActiveProp,
  onTestActiveChange,
}: ZoneMapEditorProps) {
  const foundationNoun = foundationScope === 'parish' ? 'parish' : 'town';
  const foundationTitle =
    foundationScope === 'parish' ? 'parish foundation border' : 'town foundation border';
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayPolysRef = useRef<google.maps.Polygon[]>([]);
  const contextPolysRef = useRef<google.maps.Polygon[]>([]);
  const customerPreviewPolysRef = useRef<google.maps.Polygon[]>([]);
  const townPinMarkersRef = useRef<google.maps.Marker[]>([]);
  const editPolyRef = useRef<google.maps.Polygon | null>(null);
  const searchMarkerRef = useRef<google.maps.Marker | null>(null);
  const testMarkerRef = useRef<google.maps.Marker | null>(null);
  const radiusCircleRef = useRef<google.maps.Circle | null>(null);
  const verticesRef = useRef<DashZoneVertex[]>([...initialPolygon]);
  const uiModeRef = useRef(uiMode);
  const drawTraceRef = useRef(false);
  const freehandRef = useRef(false);
  const panModeRef = useRef(false);
  const removeModeRef = useRef(false);
  const spacePanRef = useRef(false);
  const freehandActiveRef = useRef(false);
  const lastSampleRef = useRef<DashZoneVertex | null>(null);
  const mapListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const [showNeighbors, setShowNeighbors] = useState(true);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapTypeState, setMapTypeState] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [vertexCount, setVertexCount] = useState(initialPolygon.length);
  const [editVertices, setEditVertices] = useState<DashZoneVertex[]>([...initialPolygon]);
  const [testActiveState, setTestActiveState] = useState(false);
  const [testResult, setTestResult] = useState<CoverageCheckResult | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const testActiveRef = useRef(false);
  /** Click / freehand adds corners. Off = drag handles only (safer reshape). */
  const [drawTrace, setDrawTrace] = useState(
    () => uiMode === 'cutout' || initialPolygon.length < 3,
  );
  /** Hold-drag to lay denser border points along the edge. */
  const [freehand, setFreehand] = useState(false);
  /** Grab/pan the map without adding corners (or hold Space while tracing). */
  const [panMode, setPanMode] = useState(false);
  /** Click a white dot to delete it (more reliable than right-click on handles). */
  const [removeMode, setRemoveMode] = useState(false);
  const [spacePan, setSpacePan] = useState(false);

  const [searchQ, setSearchQ] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchEmpty, setSearchEmpty] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const [showCoordOverlay, setShowCoordOverlay] = useState(
    () => autoOpenCoordinates && (uiMode === 'cutout' || uiMode === 'adjust'),
  );
  const [namedPoints, setNamedPoints] = useState<NamedBorderPoint[]>([]);
  const [radiusM, setRadiusM] = useState(300);
  const [showHexOverlayState, setShowHexOverlayState] = useState(false);
  const [showMapTools, setShowMapTools] = useState(false);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const mapToolsRef = useRef<HTMLDivElement>(null);

  const mapType = mapTypeProp ?? mapTypeState;
  const showHexOverlay = showHexOverlayProp ?? showHexOverlayState;
  const testActive = testActiveProp ?? testActiveState;

  const applyMapType = (next: 'roadmap' | 'hybrid') => {
    if (onMapTypeChange) onMapTypeChange(next);
    else setMapTypeState(next);
  };
  const applyShowHexOverlay = (next: boolean) => {
    if (onShowHexOverlayChange) onShowHexOverlayChange(next);
    else setShowHexOverlayState(next);
  };
  const applyTestActive = (next: boolean) => {
    if (onTestActiveChange) onTestActiveChange(next);
    else setTestActiveState(next);
    if (!next) setTestResult(null);
  };


  uiModeRef.current = uiMode;
  drawTraceRef.current = drawTrace;
  freehandRef.current = freehand;
  panModeRef.current = panMode;
  removeModeRef.current = removeMode;
  spacePanRef.current = spacePan;
  testActiveRef.current = testActive;
  const drawing = uiMode === 'cutout' || uiMode === 'adjust' || uiMode === 'service';
  const editKind: DashZoneKind = uiMode === 'cutout' ? 'exclude' : 'include';
  const editingOverlay = editingZoneId ? zones.find((z) => z.id === editingZoneId) : undefined;
  const editingExistingService =
    uiMode === 'adjust' &&
    editingOverlay != null &&
    isServiceAreaSource(editingOverlay.source);
  const hasServiceAreas = zones.some(
    (z) => z.kind === 'include' && z.source !== 'import' && z.polygon.length >= 3,
  );

  useEffect(() => {
    if (!showMapTools) return;
    const onDoc = (e: MouseEvent) => {
      if (mapToolsRef.current && !mapToolsRef.current.contains(e.target as Node)) {
        setShowMapTools(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showMapTools]);

  const primaryInclude =
    townIncludePolygons.find((p) => p.length >= 3) ??
    zones.find((z) => z.kind === 'include' && z.polygon.length >= 3)?.polygon ??
    [];

  const clearOverlays = () => {
    for (const p of overlayPolysRef.current) p.setMap(null);
    overlayPolysRef.current = [];
    for (const p of contextPolysRef.current) p.setMap(null);
    contextPolysRef.current = [];
    for (const p of customerPreviewPolysRef.current) p.setMap(null);
    customerPreviewPolysRef.current = [];
  };

  const customerPreviewPolygons = zonesToMapPolygons(publishedZones, { kind: 'include' });

  const syncTownPinMarkers = () => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of townPinMarkersRef.current) m.setMap(null);
    townPinMarkersRef.current = [];
    if (foundationScope !== 'parish' || referenceTownPins.length === 0) return;
    for (const pin of referenceTownPins) {
      if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) continue;
      const marker = new google.maps.Marker({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        title: pin.name,
        label: {
          text: pin.name.length > 14 ? `${pin.name.slice(0, 13)}…` : pin.name,
          color: '#0c4a6e',
          fontSize: '11px',
          fontWeight: '600',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#38bdf8',
          fillOpacity: 1,
          strokeColor: '#0c4a6e',
          strokeWeight: 1.5,
        },
        zIndex: 50,
      });
      townPinMarkersRef.current.push(marker);
    }
  };

  const syncCustomerPreviewOverlays = () => {
    const map = mapRef.current;
    if (!map) return;
    for (const p of customerPreviewPolysRef.current) p.setMap(null);
    customerPreviewPolysRef.current = [];
    for (const ring of customerPreviewPolygons) {
      if (ring.length < 3) continue;
      const path = ring.map((v) => ({ lat: v.lat, lng: v.lng }));
      const poly = new google.maps.Polygon({
        paths: path,
        map,
        editable: false,
        draggable: false,
        strokeColor: '#22d3ee',
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: '#22d3ee',
        fillOpacity: 0.06,
        clickable: false,
        zIndex: 2,
      });
      customerPreviewPolysRef.current.push(poly);
    }
  };

  const syncContextOverlays = () => {
    const map = mapRef.current;
    if (!map) return;
    for (const p of contextPolysRef.current) p.setMap(null);
    contextPolysRef.current = [];
    const showContext = foundationScope === 'parish' || (showNeighborToggle && showNeighbors);
    if (!showContext) return;
    for (const town of contextTownPolygons) {
      if (town.polygon.length < 3) continue;
      const path = town.polygon.map((v) => ({ lat: v.lat, lng: v.lng }));
      const poly = new google.maps.Polygon({
        paths: path,
        map,
        editable: false,
        draggable: false,
        ...styleForContextTown(town.isActive),
      });
      contextPolysRef.current.push(poly);
    }
  };

  const clearEditPoly = () => {
    if (editPolyRef.current) {
      editPolyRef.current.setMap(null);
      editPolyRef.current = null;
    }
  };

  const publishVertices = (verts: DashZoneVertex[]) => {
    verticesRef.current = verts;
    setVertexCount(verts.length);
    setEditVertices([...verts]);
  };

  /** Add a corner: append while building; once a shape exists, insert on the nearest side. */
  const addVertexAt = (
    lat: number,
    lng: number,
    minGapM: number,
    opts?: { insertOnEdge?: boolean },
  ) => {
    if (verticesRef.current.length > 500) return;
    const next = { lat, lng };
    const insertOnEdge = opts?.insertOnEdge === true;

    if (editPolyRef.current) {
      const path = editPolyRef.current.getPath();
      if (path.getLength() > 0) {
        const last = path.getAt(path.getLength() - 1);
        if (metersBetween({ lat: last.lat(), lng: last.lng() }, next) < minGapM) return;
      }

      if (insertOnEdge && path.getLength() >= 3) {
        const ring = pathToVertices(path);
        const hit = nearestEdgeInsertIndex(next, ring);
        if (hit && hit.distM <= INSERT_EDGE_MAX_M) {
          const before = ring[(hit.index - 1 + ring.length) % ring.length];
          const after = ring[hit.index % ring.length];
          if (
            metersBetween(before, next) < minGapM ||
            metersBetween(after, next) < minGapM
          ) {
            return;
          }
          path.insertAt(hit.index, new google.maps.LatLng(lat, lng));
          publishVertices(pathToVertices(path));
          return;
        }
        // Far from every side — do not append (that warps the fence). User must click near an edge.
        return;
      }

      path.push(new google.maps.LatLng(lat, lng));
      publishVertices(pathToVertices(path));
      return;
    }

    const prev = verticesRef.current;
    if (prev.length > 0 && metersBetween(prev[prev.length - 1], next) < minGapM) return;

    if (insertOnEdge && prev.length >= 3) {
      const hit = nearestEdgeInsertIndex(next, prev);
      if (hit && hit.distM <= INSERT_EDGE_MAX_M) {
        const before = prev[(hit.index - 1 + prev.length) % prev.length];
        const after = prev[hit.index % prev.length];
        if (metersBetween(before, next) < minGapM || metersBetween(after, next) < minGapM) {
          return;
        }
        const verts = [...prev.slice(0, hit.index), next, ...prev.slice(hit.index)];
        publishVertices(verts);
        syncEditPolygon();
        return;
      }
      return;
    }

    const verts = [...prev, next];
    publishVertices(verts);
    syncEditPolygon();
  };

  const undoLastPoint = () => {
    if (editPolyRef.current) {
      const path = editPolyRef.current.getPath();
      if (path.getLength() === 0) return;
      path.removeAt(path.getLength() - 1);
      publishVertices(pathToVertices(path));
      if (path.getLength() < 2) clearEditPoly();
      return;
    }
    if (verticesRef.current.length === 0) return;
    publishVertices(verticesRef.current.slice(0, -1));
    syncEditPolygon();
  };

  /** Remove the nearest vertex to a map click (Remove tool / right-click). */
  const removeVertexNear = (lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map || verticesRef.current.length > 500) return false;

    if (editPolyRef.current) {
      const path = editPolyRef.current.getPath();
      if (path.getLength() === 0) return false;
      const ring = pathToVertices(path);
      const bestIdx = nearestVertexIndexByPixels(map, lat, lng, ring, DELETE_VERTEX_MAX_PX);
      if (bestIdx < 0) return false;
      path.removeAt(bestIdx);
      publishVertices(pathToVertices(path));
      if (path.getLength() < 2) clearEditPoly();
      return true;
    }

    const prev = verticesRef.current;
    if (prev.length === 0) return false;
    const bestIdx = nearestVertexIndexByPixels(map, lat, lng, prev, DELETE_VERTEX_MAX_PX);
    if (bestIdx < 0) return false;
    const verts = [...prev.slice(0, bestIdx), ...prev.slice(bestIdx + 1)];
    publishVertices(verts);
    syncEditPolygon();
    return true;
  };

  const addVertexAtRef = useRef(addVertexAt);
  addVertexAtRef.current = addVertexAt;
  const undoLastPointRef = useRef(undoLastPoint);
  undoLastPointRef.current = undoLastPoint;
  const removeVertexNearRef = useRef(removeVertexNear);
  removeVertexNearRef.current = removeVertexNear;

  const syncOverlays = () => {
    const map = mapRef.current;
    if (!map) return;
    clearOverlays();
    syncContextOverlays();
    syncCustomerPreviewOverlays();
    syncTownPinMarkers();
    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;
    for (const z of zones) {
      if (editingZoneId && z.id === editingZoneId) continue;
      if (z.polygon.length < 3) continue;
      const path = z.polygon.map((v) => ({ lat: v.lat, lng: v.lng }));
      const baseStyle = styleForKind(z.kind, z.id, {
        contextOnly:
          z.kind === 'include' && hasServiceAreas && z.source === 'import',
        serviceArea: z.kind === 'include' && isServiceAreaSource(z.source),
      });
      const isService = z.kind === 'include' && isServiceAreaSource(z.source);
      const canSelect =
        uiMode === 'view' &&
        typeof onSelectZone === 'function' &&
        (z.kind === 'exclude' || isService);
      const poly = new google.maps.Polygon({
        paths: path,
        map,
        editable: false,
        draggable: false,
        ...baseStyle,
        fillOpacity: drawing || uiMode === 'radius' ? 0.12 : baseStyle.fillOpacity,
        clickable: canSelect,
        zIndex: canSelect ? (baseStyle.zIndex ?? 30) + 5 : baseStyle.zIndex,
      });
      if (canSelect) {
        poly.addListener('click', () => onSelectZone(z.id));
      }
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
    // PERF-1: official high-vertex outlines are read-only — Maps freezes with thousands of handles.
    const editable = verts.length <= 500;
    const editingZone = editingZoneId ? zones.find((z) => z.id === editingZoneId) : undefined;
    const editingServiceArea =
      uiMode === 'service' ||
      (editKind === 'include' && isServiceAreaSource(editingZone?.source));
    const style = styleForKind(editKind, editingZoneId ?? undefined, {
      serviceArea: editingServiceArea,
    });
    const poly = new google.maps.Polygon({
      paths: verts.map((v) => ({ lat: v.lat, lng: v.lng })),
      map,
      editable,
      draggable: false,
      ...style,
      // Need clickable so Google mid-edge handles work when Trace is off.
      clickable: editable,
    });
    editPolyRef.current = poly;
    if (!editable) return;
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
  };

  const endFreehand = () => {
    if (!freehandActiveRef.current) return;
    freehandActiveRef.current = false;
    lastSampleRef.current = null;
    mapRef.current?.setOptions({ draggable: true, gestureHandling: 'greedy' });
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
      zoomControl: true,
      scrollwheel: true,
      gestureHandling: 'greedy',
    });
    mapRef.current = map;
    setMapInstance(map);

    clickListenerRef.current = map.addListener('click', async (e: google.maps.MapMouseEvent) => {
      const latLng = e.latLng;
      if (!latLng) return;
      const lat = latLng.lat();
      const lng = latLng.lng();

      if (testActiveRef.current) {
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

      const mode = uiModeRef.current;
      const tracing = mode === 'cutout' || mode === 'adjust' || mode === 'service';
      if (!tracing || testActiveRef.current) {
        // fall through below for view/radius
      } else if (removeModeRef.current && !spacePanRef.current) {
        removeVertexNearRef.current(lat, lng);
        return;
      } else if (
        drawTraceRef.current &&
        !freehandRef.current &&
        !panModeRef.current &&
        !spacePanRef.current
      ) {
        addVertexAtRef.current(lat, lng, CLICK_DEDUPE_M, {
          insertOnEdge: verticesRef.current.length >= 3,
        });
        return;
      }

      if (mode === 'view' || mode === 'radius') {
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

    const onMouseDown = (e: google.maps.MapMouseEvent) => {
      if (testActiveRef.current) return;
      const mode = uiModeRef.current;
      if (!(mode === 'cutout' || mode === 'adjust' || mode === 'service')) return;
      if (panModeRef.current || spacePanRef.current) return;
      if (!drawTraceRef.current || !freehandRef.current || !e.latLng) return;
      freehandActiveRef.current = true;
      map.setOptions({
        draggable: false,
        scrollwheel: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      lastSampleRef.current = { lat, lng };
      addVertexAtRef.current(lat, lng, CLICK_DEDUPE_M);
    };
    const onMouseMove = (e: google.maps.MapMouseEvent) => {
      if (!freehandActiveRef.current || !e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const next = { lat, lng };
      const last = lastSampleRef.current;
      if (last && metersBetween(last, next) < FREEHAND_MIN_M) return;
      lastSampleRef.current = next;
      addVertexAtRef.current(lat, lng, FREEHAND_MIN_M);
    };
    const onMouseUp = () => {
      if (!freehandActiveRef.current) return;
      freehandActiveRef.current = false;
      lastSampleRef.current = null;
      // Keep pan disabled while Trace is on (handled by drag-lock effect).
      if (
        !(
          drawTraceRef.current &&
          !freehandRef.current &&
          !panModeRef.current &&
          !spacePanRef.current
        )
      ) {
        map.setOptions({ draggable: true, gestureHandling: 'greedy' });
      }
    };

    const onContextMenu = (e: google.maps.MapMouseEvent) => {
      const mode = uiModeRef.current;
      if (!(mode === 'cutout' || mode === 'adjust' || mode === 'service')) return;
      if (!e.latLng) return;
      const dom = (e as google.maps.MapMouseEvent & { domEvent?: Event }).domEvent;
      dom?.preventDefault?.();
      removeVertexNearRef.current(e.latLng.lat(), e.latLng.lng());
    };

    mapListenersRef.current = [
      map.addListener('mousedown', onMouseDown),
      map.addListener('mousemove', onMouseMove),
      map.addListener('mouseup', onMouseUp),
      map.addListener('mouseout', onMouseUp),
      map.addListener('rightclick', onContextMenu),
    ];

    // Parent Markets panel is overflow-y-auto and steals the wheel — zoom the map ourselves.
    const mapDiv = map.getDiv();
    const onWheelZoom = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const current = map.getZoom();
      if (current == null) return;
      const next = current - e.deltaY * 0.01;
      map.setZoom(Math.min(21, Math.max(3, next)));
    };
    mapDiv.addEventListener('wheel', onWheelZoom, { passive: false, capture: true });

    syncOverlays();
    verticesRef.current = [...initialPolygon];
    syncEditPolygon();

    return () => {
      mapDiv.removeEventListener('wheel', onWheelZoom, true);
      for (const l of mapListenersRef.current) {
        google.maps.event.removeListener(l);
      }
      mapListenersRef.current = [];
      if (clickListenerRef.current) {
        google.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
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

  // Google Maps needs an explicit resize after the container grows (Expand map / flex fill).
  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    google.maps.event.trigger(map, 'resize');
    if (!fillAvailableHeight) return;
    const ro = new ResizeObserver(() => {
      google.maps.event.trigger(map, 'resize');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapHeight, fillAvailableHeight, mapInstance]);

  // Only re-seed the edit polygon when mode / zone target changes — not when
  // the parent refreshes zone lists (that was snapping borders back to default).
  useEffect(() => {
    if (!mapRef.current) return;
    verticesRef.current = [...initialPolygon];
    setEditVertices([...initialPolygon]);
    applyTestActive(false);
    setTestResult(null);
    setShowCoordOverlay(false);
    setDrawTrace(uiMode === 'cutout' || uiMode === 'service' || initialPolygon.length < 3);
    setFreehand(false);
    setPanMode(false);
    setRemoveMode(false);
    setSpacePan(false);
    endFreehand();
    syncOverlays();
    syncEditPolygon();
    syncRadiusPreview();
    if (uiMode === 'cutout' || uiMode === 'adjust' || uiMode === 'service') {
      if (verticesRef.current.length >= 3) {
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
      } else if (uiMode === 'service' || uiMode === 'cutout') {
        // Start drawing zoomed in — town-wide fit makes neighborhood fences painful.
        const c = polygonCentroid(primaryInclude);
        if (c) mapRef.current.setCenter(c);
        mapRef.current.setZoom(15);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiMode, editingZoneId]);

  // Trace: lock pan so clicks add corners. Pan tool / hold-Space unlocks drag.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const allowPan =
      !drawing ||
      panMode ||
      spacePan ||
      testActive ||
      (!drawTrace && !removeMode) ||
      freehand;
    if (
      drawing &&
      ((drawTrace && !freehand && !panMode && !spacePan && !testActive && !removeMode) ||
        (removeMode && !panMode && !spacePan && !testActive))
    ) {
      map.setOptions({
        draggable: false,
        scrollwheel: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        draggableCursor: removeMode ? 'pointer' : 'crosshair',
        draggingCursor: removeMode ? 'pointer' : 'crosshair',
      });
    } else if (allowPan && !freehand) {
      map.setOptions({
        draggable: true,
        scrollwheel: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        draggableCursor: panMode || spacePan ? 'grab' : undefined,
        draggingCursor: panMode || spacePan ? 'grabbing' : undefined,
      });
    }
  }, [drawing, drawTrace, freehand, panMode, removeMode, spacePan, testActive, mapInstance]);

  // Remove mode: disable vertex drag handles so map clicks hit the dots instead of starting a drag.
  useEffect(() => {
    const poly = editPolyRef.current;
    if (!poly) return;
    const canEdit = verticesRef.current.length >= 2 && verticesRef.current.length <= 500;
    if (removeMode) {
      poly.setEditable(false);
      poly.setOptions({ clickable: false, cursor: 'pointer' });
    } else {
      poly.setEditable(canEdit);
      poly.setOptions({ clickable: canEdit, cursor: undefined });
    }
  }, [removeMode, vertexCount, mapInstance]);

  // Keyboard: Undo; hold Space to pan while drawing
  useEffect(() => {
    if (!drawing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        spacePanRef.current = true;
        setSpacePan(true);
        return;
      }
      const undo =
        e.key === 'Backspace' ||
        ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z'));
      if (!undo) return;
      e.preventDefault();
      undoLastPointRef.current();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spacePanRef.current = false;
      setSpacePan(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [drawing]);

  // Keep background overlays in sync without resetting the in-progress edit.
  useEffect(() => {
    if (!mapRef.current) return;
    syncOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    zones.map((z) => `${z.id}:${z.polygon.length}`).join('|'),
    contextTownPolygons.map((t) => `${t.id}:${t.polygon.length}:${t.isActive}`).join('|'),
    customerPreviewPolygons.map((p, i) => `${i}:${p.length}`).join('|'),
    publishedZones.map((z) => `${z.id ?? ''}:${z.polygon.length}`).join('|'),
    showNeighbors,
    foundationScope,
    referenceTownPins.map((p) => `${p.id}:${p.lat}:${p.lng}:${p.name}`).join('|'),
  ]);

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
    const polygon = points.map((p) => ({ lat: p.lat, lng: p.lng }));
    verticesRef.current = polygon;
    setEditVertices(polygon);
    setVertexCount(polygon.length);
    setShowCoordOverlay(false);
    // Apply on the coordinates form is the final save — no second map confirm.
    void onSave({ polygon, source: 'manual' });
  };

  const closeCoordinateOverlay = () => {
    setShowCoordOverlay(false);
    // Opened from Manage zones → Cancel exits edit mode entirely.
    if (autoOpenCoordinates) onCancel();
  };

  const clearDrawing = () => {
    endFreehand();
    verticesRef.current = [];
    setVertexCount(0);
    setEditVertices([]);
    setNamedPoints([]);
    setPanMode(false);
    setDrawTrace(true);
    setFreehand(false);
    setRemoveMode(false);
    syncEditPolygon();
  };

  const handleSavePolygon = () => {
    endFreehand();
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
      : uiMode === 'service'
        ? freehand
          ? 'Freehand on: hold and drag · then Save'
          : panMode || spacePan
            ? 'Hand/pan on: drag the map · switch back to Trace (or release Space) to add corners'
            : removeMode
              ? 'Remove on: click a white dot to delete that point · then switch back to Trace or Pan'
            : vertexCount >= 3
              ? 'Drag white dots to reshape · Trace + click near a side to add · Remove tool to delete a dot · then Save'
              : 'Trace on: click corners · Hand or hold Space to move the map · then Save. Outside this area = no delivery.'
      : uiMode === 'cutout' || uiMode === 'adjust'
        ? freehand
          ? 'Freehand on: hold and drag along the border · Undo removes the last point · then Save'
          : panMode || spacePan
            ? 'Hand/pan on: drag the map · switch to Trace (or release Space) to add corners'
            : removeMode
              ? 'Remove on: click a white dot to delete that point'
            : drawTrace
            ? vertexCount >= 3
              ? 'Drag white dots · click near a side to add · use Remove to delete a dot · then Save'
              : 'Trace on: click corners · Hand or hold Space to move the map · Freehand for denser edges · then Save'
            : `Drag the white dots to reshape. Use Remove to delete a point. Turn on “Trace” to add points along the ${foundationTitle}.`
        : foundationScope === 'parish'
          ? 'Violet outline = parish foundation (ops only). Sky pins = town/city reference. Amber polygons = town delivery borders (if set).'
          : hasServiceAreas
            ? 'Magenta = live service areas (click one to edit). Bright green = official town border (context only). Red = temporary no-delivery.'
            : 'Green = this town’s live delivery border. Red = no delivery. Neighbor towns (amber) are reference only.';

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
    <div
      className={`rounded-xl border border-slate-700 bg-slate-950/80 p-2 sm:p-3 ${
        fillAvailableHeight ? 'h-full min-h-0 flex flex-col gap-2' : 'space-y-3'
      }`}
    >
      <div className="relative flex flex-wrap items-start gap-2 shrink-0">
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
        {mapToolsPlacement === 'inline' ? (
          <div className="relative" ref={mapToolsRef}>
            <button
              type="button"
              onClick={() => setShowMapTools((v) => !v)}
              className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs ${
                showHexOverlay || testActive || mapType === 'hybrid'
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                  : 'border-slate-600 text-slate-100'
              }`}
            >
              Map tools
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {showMapTools && (
              <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-slate-100 hover:bg-slate-800"
                  onClick={() => applyMapType(mapType === 'roadmap' ? 'hybrid' : 'roadmap')}
                >
                  <Satellite className="w-3.5 h-3.5 shrink-0" />
                  {mapType === 'hybrid' ? 'Satellite (on)' : 'Satellite'}
                </button>
                {hexCells.length > 0 ? (
                  <button
                    type="button"
                    className={`w-full flex items-center gap-2 text-left px-3 py-2 text-xs hover:bg-slate-800 ${
                      showHexOverlay ? 'text-cyan-200' : 'text-slate-100'
                    }`}
                    onClick={() => applyShowHexOverlay(!showHexOverlay)}
                  >
                    Hex overlay ({hexCells.length})
                    {showHexOverlay ? <Check className="w-3.5 h-3.5 ml-auto" /> : null}
                  </button>
                ) : (
                  <p
                    className="px-3 py-2 text-xs text-slate-400"
                    title="Publish coverage once to build the hex grid"
                  >
                    Hex overlay (not built)
                  </p>
                )}
                {onTestPoint ? (
                  <button
                    type="button"
                    className={`w-full flex items-center gap-2 text-left px-3 py-2 text-xs hover:bg-slate-800 ${
                      testActive ? 'text-amber-200' : 'text-slate-100'
                    }`}
                    onClick={() => applyTestActive(!testActive)}
                  >
                    <Crosshair className="w-3.5 h-3.5 shrink-0" />
                    {testActive ? 'Test pin (on)' : 'Test pin'}
                    {testActive ? <Check className="w-3.5 h-3.5 ml-auto" /> : null}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-200 flex items-center gap-1.5 shrink-0">
        {uiMode === 'cutout' || uiMode === 'radius' ? (
          <Scissors className="w-3.5 h-3.5 text-red-400" />
        ) : (
          <Pencil className="w-3.5 h-3.5 text-emerald-400" />
        )}
        {hint}
      </p>

      {uiMode === 'view' && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-200 px-0.5 shrink-0">
          {foundationScope === 'parish' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-violet-400/90 border border-violet-300/70" />
                Parish foundation (ops)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-900/60" />
                Town pins (reference)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/90 border border-amber-300/70" />
                Town borders (if set)
              </span>
              {customerPreviewPolygons.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400/50 border border-cyan-300/60 border-dashed" />
                  Live (customers)
                </span>
              )}
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`w-2.5 h-2.5 rounded-sm border ${
                    hasServiceAreas || uiMode === 'service'
                      ? 'bg-fuchsia-500/70 border-fuchsia-400/50'
                      : 'bg-emerald-500/70 border-emerald-400/50'
                  }`}
                />
                {hasServiceAreas || uiMode === 'service' ? 'Service area (live)' : 'Draft (editing)'}
              </span>
              {hasServiceAreas ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-green-400 border border-green-200" />
                  Official border (context)
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500/70 border border-red-400/50" />
                No-delivery cutout
              </span>
              {contextTownPolygons.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/80 border border-amber-300/60" />
                  Other towns (context)
                </span>
              )}
              {customerPreviewPolygons.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400/50 border border-cyan-300/60 border-dashed" />
                  Live (customers)
                </span>
              )}
            </>
          )}
          {foundationScope === 'town' && showNeighborToggle && contextTownPolygons.length > 0 && (
            <label className="inline-flex items-center gap-1.5 ml-auto cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showNeighbors}
                onChange={(e) => setShowNeighbors(e.target.checked)}
                className="rounded border-slate-600"
              />
              Show neighboring towns
            </label>
          )}
        </div>
      )}

      {drawing && vertexCount > 500 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 shrink-0">
          Official outline is read-only — too many vertices to edit safely
        </div>
      )}

      {drawing && (
        <div className="z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 shrink-0">
          <p className="text-xs text-amber-100">
            {uiMode === 'cutout'
              ? `Editing non-delivery zone · ${vertexCount} points`
              : uiMode === 'service' || editingExistingService
                ? `Editing service area${editingOverlay?.name ? ` · ${editingOverlay.name}` : ''} · ${vertexCount} points`
              : `Editing ${foundationTitle} · ${vertexCount} points`}
            {vertexCount > 500
              ? ' · view only'
              : freehand
                ? ' · freehand'
                : drawTrace
                  ? vertexCount >= 3
                    ? ' · click near a side to add'
                    : ' · click to add'
                  : removeMode
                    ? ' · click a white dot to remove'
                  : ' · drag handles'}
            {' — save or cancel when done'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCoordOverlay(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-900 text-xs font-semibold"
            >
              <MapPin className="w-3.5 h-3.5" />
              Enter / edit coordinates
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
                  : uiMode === 'service' || editingExistingService
                    ? 'Save service area'
                    : `Save ${foundationNoun} border`}
            </button>
          </div>
        </div>
      )}

      <CoordinateEntryOverlay
        open={showCoordOverlay}
        onClose={closeCoordinateOverlay}
        vertices={editVertices}
        knownPoints={namedPoints.length > 0 ? namedPoints : undefined}
        onApply={applyNamedCoordinates}
      />

      {selectedPlace && uiMode !== 'adjust' && uiMode !== 'cutout' && uiMode !== 'service' && (
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
        className={`w-full rounded-lg overflow-hidden border border-slate-800 ${
          fillAvailableHeight ? 'flex-1 min-h-[200px]' : ''
        }`}
        style={
          fillAvailableHeight
            ? { overscrollBehavior: 'contain' }
            : { height: `${mapHeight}px`, overscrollBehavior: 'contain' }
        }
        onWheel={(e) => {
          // Page/sidebar scroll must not steal zoom while pointer is on the map.
          e.stopPropagation();
        }}
      />
      <HexCellsMapOverlay map={mapInstance} cells={hexCells} visible={showHexOverlay} />

      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          {drawing
            ? `${vertexCount} points · ${
                uiMode === 'cutout'
                  ? 'non-delivery zone'
                  : uiMode === 'service' || editingExistingService
                    ? 'service area'
                    : foundationTitle
              }`
            : uiMode === 'radius'
              ? `Radius non-delivery · ${radiusM}m`
              : foundationScope === 'parish'
                ? `${zones.some((z) => z.id === 'parish-foundation' && z.polygon.length >= 3) ? 'Parish foundation shown' : 'No parish border yet'} · towns as context only`
                : `${zones.filter((z) => z.kind === 'include').length ? 'Town delivery border shown' : 'No town border'} · ${
                    zones.filter((z) => z.kind === 'exclude').length
                  } non-delivery zone${zones.filter((z) => z.kind === 'exclude').length === 1 ? '' : 's'}`}
        </p>
        {drawing && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPanMode(true);
                setFreehand(false);
                setRemoveMode(false);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs ${
                panMode
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
                  : 'border-slate-700 text-slate-300'
              }`}
              title="Grab and move the map (or hold Space while tracing)"
            >
              <Hand className="w-3.5 h-3.5" />
              Pan
            </button>
            <button
              type="button"
              onClick={() => {
                setPanMode(false);
                setRemoveMode(false);
                setDrawTrace(true);
                setFreehand(false);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs ${
                drawTrace && !freehand && !panMode && !removeMode
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                  : 'border-slate-700 text-slate-300'
              }`}
              title={
                vertexCount >= 3
                  ? 'Click near a side to insert a point, then drag the white dot'
                  : 'Click the map to add border points'
              }
            >
              <Pencil className="w-3.5 h-3.5" />
              Trace
            </button>
            <button
              type="button"
              onClick={() => {
                setPanMode(false);
                setDrawTrace(true);
                setFreehand(true);
                setRemoveMode(false);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs ${
                freehand && !panMode && !removeMode
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                  : 'border-slate-700 text-slate-300'
              }`}
              title="Hold and drag to lay denser points (~14m apart)"
            >
              <PencilLine className="w-3.5 h-3.5" />
              Freehand
            </button>
            <button
              type="button"
              onClick={() => {
                setRemoveMode(true);
                setPanMode(false);
                setFreehand(false);
                setDrawTrace(false);
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs ${
                removeMode
                  ? 'border-red-500/50 bg-red-500/15 text-red-200'
                  : 'border-slate-700 text-slate-300'
              }`}
              title="Click a white dot to delete that point"
            >
              <CircleDot className="w-3.5 h-3.5" />
              Remove
            </button>
            <button
              type="button"
              onClick={undoLastPoint}
              disabled={vertexCount < 1}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 disabled:opacity-40"
              title="Undo last point (Backspace or Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo
            </button>
            <button
              type="button"
              onClick={clearDrawing}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300"
              title="Clear all points and start over"
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
                  : uiMode === 'service' || editingExistingService
                    ? 'Save service area'
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
