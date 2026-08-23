import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  Map,
  MapPin,
  Maximize2,
  Minimize2,
  Plus,
  Pencil,
  Trash2,
  Scissors,
  Download,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import {
  checkCoveragePoint,
  createMarket,
  createParish,
  createZone,
  deleteParish,
  deleteZone,
  getMarketReadiness,
  importMarketGeoJson,
  listActivityLog,
  listCoverageVersions,
  listMarkets,
  publishMarketCoverage,
  restoreCoverageVersion,
  updateMarket,
  updateParishOutline,
  updateZone,
  type ActivityLogRow,
  type CoverageVersionRow,
  type DashMarketRow,
  type DashParishRow,
  type DashZoneRow,
  type DashZoneVertex,
  type MarketReadiness,
  type ReadinessCheck,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { ZoneMapEditor, type ZoneMapUiMode } from './ZoneMapEditor';
import { detectCoverageConflicts } from './coverageGeo';
import { ManageZonesOverlay } from './ManageZonesOverlay';
import { ImportTownBorderOverlay } from './ImportTownBorderOverlay';
import {
  downloadTextFile,
  parsePolygonCsv,
  polygonFromGeoJson,
  polygonToCsv,
  polygonToGeoJson,
  slugFilename,
  zonesToCsv,
} from './coverageIo';

function normalizeZone(z: DashZoneRow): DashZoneRow {
  const poly = Array.isArray(z.polygon) ? z.polygon : [];
  return {
    ...z,
    kind: z.kind === 'exclude' ? 'exclude' : 'include',
    polygon: poly.filter(
      (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng),
    ) as DashZoneVertex[],
    priority: Number.isFinite(z.priority) ? z.priority : 0,
  };
}

function normalizeTown(m: DashMarketRow): DashMarketRow {
  return { ...m, zones: (m.zones ?? []).map(normalizeZone) };
}

function normalizeParish(p: DashParishRow): DashParishRow {
  const poly = Array.isArray(p.foundation_polygon) ? p.foundation_polygon : [];
  return {
    ...p,
    foundation_polygon: poly.filter(
      (v) => v && Number.isFinite(v.lat) && Number.isFinite(v.lng),
    ) as DashZoneVertex[],
    towns: (p.towns ?? []).map(normalizeTown),
  };
}

function parishFoundationVerts(p: DashParishRow): DashZoneVertex[] {
  const poly = p.foundation_polygon ?? [];
  return poly.filter((v) => v && Number.isFinite(v.lat) && Number.isFinite(v.lng));
}

function includeZones(m: DashMarketRow): DashZoneRow[] {
  return (m.zones ?? []).filter((z) => z.kind === 'include' && z.polygon.length >= 3);
}

function primaryDeliveryArea(m: DashMarketRow): DashZoneRow | null {
  const includes = includeZones(m);
  if (includes.length === 0) return null;
  return [...includes].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0] ?? null;
}

type EditorTarget =
  | { mode: 'cutout'; marketId: string; openCoordinates?: boolean }
  | { mode: 'radius'; marketId: string }
  | { mode: 'adjust'; marketId: string; zone: DashZoneRow; openCoordinates?: boolean };

type TownCardProps = {
  town: DashMarketRow;
  canWrite: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleActive: (m: DashMarketRow) => void;
  onOpenMap: (opts?: { editor?: EditorTarget }) => void;
  onRemoveZone: (marketId: string, zone: DashZoneRow) => void;
};

function TownCard({
  town: m,
  canWrite,
  expanded,
  onToggleExpanded,
  onToggleActive,
  onOpenMap,
  onRemoveZone,
}: TownCardProps) {
  const zones = m.zones ?? [];
  const includes = zones.filter((z) => z.kind === 'include');
  const excludes = zones.filter((z) => z.kind === 'exclude');

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="p-1 rounded hover:bg-slate-800 text-slate-400"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white text-sm flex items-center gap-2">
            {m.name}
            {m.draft_dirty ? (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                Unpublished
              </span>
            ) : null}
          </h4>
          <p className="text-xs text-slate-500">
            Town · {m.is_active ? 'Active' : 'Inactive'}
            {' · '}
            {includes.length > 0 ? 'Town border set' : 'No town border'}
            {' · '}
            {excludes.length} non-delivery zone{excludes.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenMap()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-900 text-xs text-slate-100 hover:bg-slate-800"
        >
          <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
          Open map
        </button>
        {canWrite && (
          <button
            type="button"
            onClick={() => onToggleActive(m)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              m.is_active ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
            title={
              includeZones(m).length === 0 && !m.is_active
                ? 'Add a town border first'
                : undefined
            }
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                m.is_active ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-800/80 pt-3">
          {excludes.length > 0 && (
            <ul className="space-y-2">
              {excludes.map((z) => (
                <li
                  key={z.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm"
                >
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">
                    {z.source === 'radius' ? 'Radius' : 'No delivery'}
                  </span>
                  <span className="font-medium text-slate-200">{z.name}</span>
                  {canWrite && (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenMap({ editor: { mode: 'adjust', marketId: m.id, zone: z } })
                        }
                        className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
                        title="Edit non-delivery zone on map"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveZone(m.id, z)}
                        className="p-1.5 rounded hover:bg-slate-800 text-red-400"
                        title="Delete non-delivery zone"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (includes.length === 0) {
                    toast.error('Town border missing — reload the page to restore it');
                    return;
                  }
                  onOpenMap({ editor: { mode: 'radius', marketId: m.id } });
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/40 text-xs text-red-300"
              >
                <Scissors className="w-3.5 h-3.5" />
                Don’t deliver near here
              </button>
              <button
                type="button"
                onClick={() => {
                  if (includes.length === 0) {
                    toast.error('Town border missing — reload the page to restore it');
                    return;
                  }
                  onOpenMap({ editor: { mode: 'cutout', marketId: m.id } });
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-200/90"
              >
                Draw non-delivery zone
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type MapOverlayProps = {
  town: DashMarketRow;
  canWrite: boolean;
  saving: boolean;
  editor: EditorTarget | null;
  accessToken: string;
  showTip?: boolean;
  readiness: MarketReadiness | null;
  versions: CoverageVersionRow[];
  activity: ActivityLogRow[];
  onClose: () => void;
  onSetEditor: (e: EditorTarget | null) => void;
  onSaveEditor: (payload: {
    polygon: DashZoneVertex[];
    source?: 'manual' | 'radius';
    center_lat?: number;
    center_lng?: number;
    radius_m?: number;
    nameHint?: string;
  }) => void;
  onPublish: () => void;
  onRestore: (versionId: string) => void;
  onImportGeoJson: (text: string, promote: boolean) => void;
  onImportCsv: (text: string, promote: boolean) => void;
  onRefreshReadiness: () => void;
  onRequestEditFoundationOnMap: () => void;
  onRequestEditFoundationCoordinates: () => void;
  onRemoveZone: (zone: DashZoneRow) => void;
};

function TownMapOverlay({
  town,
  canWrite,
  saving,
  editor,
  accessToken,
  showTip,
  readiness,
  versions,
  activity,
  onClose,
  onSetEditor,
  onSaveEditor,
  onPublish,
  onRestore,
  onImportGeoJson,
  onImportCsv,
  onRefreshReadiness,
  onRequestEditFoundationOnMap,
  onRequestEditFoundationCoordinates,
  onRemoveZone,
}: MapOverlayProps) {
  const zones = town.zones ?? [];
  const excludes = zones.filter((z) => z.kind === 'exclude');
  const delivery = primaryDeliveryArea(town);
  const [showHistory, setShowHistory] = useState(false);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importKind, setImportKind] = useState<'geojson' | 'csv'>('geojson');
  const [promoteTemplate, setPromoteTemplate] = useState(true);
  const [showManageZones, setShowManageZones] = useState(false);
  const [showIoMenu, setShowIoMenu] = useState(false);
  /** Near-fullscreen map workspace for tracing borders. */
  const [mapExpanded, setMapExpanded] = useState(false);
  const ioMenuRef = useRef<HTMLDivElement>(null);

  const editingThis =
    editor &&
    ((editor.mode === 'cutout' && editor.marketId === town.id) ||
      (editor.mode === 'radius' && editor.marketId === town.id) ||
      (editor.mode === 'adjust' && editor.marketId === town.id));

  let uiMode: ZoneMapUiMode = 'view';
  let initialPolygon: DashZoneVertex[] = [];
  let editingZoneId: string | null = null;
  let autoOpenCoordinates = false;
  if (editingThis && editor) {
    if (editor.mode === 'radius') {
      uiMode = 'radius';
    } else if (editor.mode === 'cutout') {
      uiMode = 'cutout';
      initialPolygon = [];
      autoOpenCoordinates = editor.openCoordinates === true;
    } else if (editor.zone.kind === 'exclude') {
      uiMode = 'cutout';
      initialPolygon = editor.zone.polygon;
      editingZoneId = editor.zone.id;
      autoOpenCoordinates = editor.openCoordinates === true;
    } else {
      uiMode = 'adjust';
      initialPolygon = editor.zone.polygon;
      editingZoneId = editor.zone.id;
      autoOpenCoordinates = editor.openCoordinates === true;
    }
  }

  const includes = includeZones(town).map((z) => ({
    id: z.id,
    name: z.name,
    polygon: z.polygon,
  }));
  const excludeShapes = excludes.map((z) => ({
    id: z.id,
    name: z.name,
    polygon: z.polygon,
  }));
  const conflicts = detectCoverageConflicts(includes, excludeShapes);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    onRefreshReadiness();
  }, [town.id, town.draft_dirty, zones.length, onRefreshReadiness]);

  useEffect(() => {
    if (!showIoMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (ioMenuRef.current && !ioMenuRef.current.contains(e.target as Node)) {
        setShowIoMenu(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showIoMenu]);

  const exportTownGeoJson = () => {
    if (!delivery || delivery.polygon.length < 3) {
      toast.error('No town border to export');
      return;
    }
    downloadTextFile(
      slugFilename(town.name, 'geojson'),
      polygonToGeoJson(delivery.polygon, town.name),
      'application/geo+json',
    );
    toast.success('Town border GeoJSON downloaded');
  };

  const exportTownCsv = () => {
    if (!delivery || delivery.polygon.length < 3) {
      toast.error('No town border to export');
      return;
    }
    downloadTextFile(
      slugFilename(town.name, 'csv'),
      polygonToCsv(delivery.polygon),
      'text/csv;charset=utf-8',
    );
    toast.success('Town border CSV downloaded');
  };

  const exportAllZonesCsv = () => {
    const rows = zones.map((z) => ({
      kind: z.kind,
      name: z.name,
      id: z.id,
      source: z.source,
      radius_m: z.radius_m,
      center_lat: z.center_lat,
      center_lng: z.center_lng,
      polygon: z.polygon,
    }));
    if (rows.every((r) => r.polygon.length < 1)) {
      toast.error('Nothing to export');
      return;
    }
    downloadTextFile(
      slugFilename(`${town.name}-zones`, 'csv'),
      zonesToCsv(rows),
      'text/csv;charset=utf-8',
    );
    toast.success('All zones CSV downloaded');
  };

  // Jump to a big map workspace when tracing / cutting — easier than a tiny inset.
  useEffect(() => {
    if (uiMode !== 'view') setMapExpanded(true);
  }, [uiMode]);

  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const mapHeight = mapExpanded
    ? Math.max(420, viewportH - (uiMode === 'view' ? 120 : 168))
    : Math.min(560, viewportH - 280);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${
        mapExpanded ? 'p-0' : 'p-3 sm:p-6'
      }`}
    >
      {!mapExpanded && (
        <button
          type="button"
          className="absolute inset-0 bg-black/75"
          aria-label="Close map"
          onClick={onClose}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="town-map-title"
        className={`relative z-10 flex w-full flex-col border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden ${
          mapExpanded
            ? 'max-w-none h-[100dvh] max-h-[100dvh] rounded-none'
            : 'max-w-6xl max-h-[94vh] rounded-xl'
        }`}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3 shrink-0">
          <div className="flex-1 min-w-0">
            <h3 id="town-map-title" className="font-semibold text-white truncate">
              {town.name} · map
              {mapExpanded ? (
                <span className="ml-2 text-xs font-normal text-sky-300">· expanded</span>
              ) : null}
            </h3>
            <p className="text-xs text-slate-500">
              {town.is_active ? 'Active' : 'Inactive'}
              {town.draft_dirty ? ' · unpublished draft changes' : ' · published'}
            </p>
          </div>
          {canWrite && uiMode === 'view' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowManageZones(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-500 bg-slate-800 text-xs text-white font-medium"
              >
                <MapPin className="w-3.5 h-3.5 text-amber-300" />
                Manage zones
                {excludes.length > 0 ? ` (${excludes.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => onSetEditor({ mode: 'radius', marketId: town.id })}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/40 text-xs text-red-300"
              >
                <Scissors className="w-3.5 h-3.5" />
                Don’t deliver near here
              </button>
              <button
                type="button"
                onClick={() => onSetEditor({ mode: 'cutout', marketId: town.id })}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-200"
              >
                Draw non-delivery zone
              </button>
              <div className="relative" ref={ioMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowIoMenu((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-500 text-xs text-slate-100"
                >
                  <Download className="w-3.5 h-3.5" />
                  Import / Export
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {showIoMenu && (
                  <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1">
                    <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">
                      Import town border
                    </p>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                      onClick={() => {
                        setImportKind('geojson');
                        setShowImport(true);
                        setShowIoMenu(false);
                      }}
                    >
                      Import GeoJSON…
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                      onClick={() => {
                        setImportKind('csv');
                        setShowImport(true);
                        setShowIoMenu(false);
                      }}
                    >
                      Import CSV…
                    </button>
                    <div className="my-1 border-t border-slate-800" />
                    <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500">
                      Export
                    </p>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                      onClick={() => {
                        setShowIoMenu(false);
                        exportTownGeoJson();
                      }}
                    >
                      Export town GeoJSON
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                      onClick={() => {
                        setShowIoMenu(false);
                        exportTownCsv();
                      }}
                    >
                      Export town CSV
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                      onClick={() => {
                        setShowIoMenu(false);
                        exportAllZonesCsv();
                      }}
                    >
                      Export all zones CSV
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={saving || !town.draft_dirty}
                onClick={onPublish}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold disabled:opacity-40"
              >
                Publish coverage
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMapExpanded((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
              mapExpanded
                ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                : 'border-slate-700 text-slate-300 hover:bg-slate-900'
            }`}
            title={mapExpanded ? 'Shrink map back into panel' : 'Expand map to full screen'}
          >
            {mapExpanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                Shrink
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                Expand map
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="p-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-900"
            title="Versions & activity"
          >
            <History className="w-4 h-4" />
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

        <div
          className={`flex-1 overflow-y-auto space-y-3 ${
            mapExpanded ? 'p-2 sm:p-3 flex flex-col min-h-0' : 'p-4'
          }`}
        >
          {!mapExpanded && showTip && (
            <p className="text-xs text-emerald-200/90 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              Green is the town border (foundation). Red zones are where you don’t deliver. Use{' '}
              <span className="text-amber-200 font-medium">Manage zones</span> →{' '}
              <span className="text-amber-200 font-medium">Edit on map</span> to redraw the green
              border.
            </p>
          )}

          {conflicts.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 space-y-1 shrink-0">
              {conflicts.map((c) => (
                <p key={`${c.code}-${c.message}`}>{c.message}</p>
              ))}
            </div>
          )}

          {!mapExpanded && readiness && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
              <p className="text-xs font-medium text-slate-300 mb-2">
                Activation readiness · {readiness.ready ? 'Ready' : 'Not ready'}
              </p>
              <ul className="grid sm:grid-cols-2 gap-1.5">
                {readiness.checks.map((ch: ReadinessCheck) => (
                  <li
                    key={ch.id}
                    className={`text-xs rounded px-2 py-1.5 border ${
                      ch.ok
                        ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'
                        : 'border-red-500/20 bg-red-500/5 text-red-200'
                    }`}
                  >
                    <span className="font-medium">{ch.ok ? '✓' : '✗'} {ch.label}</span>
                    {ch.detail ? <span className="block text-[11px] opacity-80">{ch.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={mapExpanded ? 'flex-1 min-h-0' : undefined}>
            <ZoneMapEditor
              key={`${town.id}-${uiMode}-${editingZoneId ?? 'view'}-${autoOpenCoordinates ? 'coords' : 'map'}`}
              zones={zones.map((z) => ({
                id: z.id,
                kind: z.kind,
                polygon: z.polygon,
                name: z.name,
                source: z.source,
                center_lat: z.center_lat,
                center_lng: z.center_lng,
                radius_m: z.radius_m,
              }))}
              uiMode={uiMode}
              initialPolygon={initialPolygon}
              editingZoneId={editingZoneId}
              townIncludePolygons={includeZones(town).map((z) => z.polygon)}
              saving={saving}
              autoOpenCoordinates={autoOpenCoordinates}
              mapHeight={mapHeight}
              onCancel={() => onSetEditor(null)}
              onSave={onSaveEditor}
              onTestPoint={(lat, lng) => checkCoveragePoint(accessToken, lat, lng)}
            />
          </div>

          {showHistory && !mapExpanded && (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-800 p-3">
                <p className="text-xs font-medium text-slate-300 mb-2">Published versions</p>
                {versions.length === 0 ? (
                  <p className="text-xs text-slate-500">No versions yet — publish to create one.</p>
                ) : (
                  <ul className="space-y-2 max-h-40 overflow-y-auto">
                    {versions.map((v) => (
                      <li
                        key={v.id}
                        className="flex items-center gap-2 text-xs text-slate-300 border border-slate-800 rounded px-2 py-1.5"
                      >
                        <span className="flex-1">
                          v{v.version} {v.label ? `· ${v.label}` : ''}
                        </span>
                        {canWrite && (
                          <button
                            type="button"
                            className="text-amber-300 hover:underline"
                            onClick={() => onRestore(v.id)}
                          >
                            Restore
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-slate-800 p-3">
                <p className="text-xs font-medium text-slate-300 mb-2">Coverage activity</p>
                {activity.length === 0 ? (
                  <p className="text-xs text-slate-500">No recent coverage events.</p>
                ) : (
                  <ul className="space-y-2 max-h-40 overflow-y-auto text-xs text-slate-400">
                    {activity.map((a) => (
                      <li key={a.id} className="border-b border-slate-800/80 pb-1.5">
                        <span className="text-slate-200">{a.action}</span>
                        <span className="block truncate">{a.details || a.actor_email}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ManageZonesOverlay
        open={showManageZones && uiMode === 'view'}
        townName={town.name}
        delivery={delivery}
        excludes={excludes}
        onClose={() => setShowManageZones(false)}
        onEditTownOnMap={() => {
          setShowManageZones(false);
          onRequestEditFoundationOnMap();
        }}
        onEditTownCoordinates={() => {
          setShowManageZones(false);
          onRequestEditFoundationCoordinates();
        }}
        onEditExcludeOnMap={(zone) => {
          setShowManageZones(false);
          onSetEditor({
            mode: 'adjust',
            marketId: town.id,
            zone,
          });
        }}
        onEditExcludeCoordinates={(zone) => {
          setShowManageZones(false);
          onSetEditor({
            mode: 'adjust',
            marketId: town.id,
            zone,
            openCoordinates: true,
          });
        }}
        onDeleteExclude={(zone) => {
          setShowManageZones(false);
          onRemoveZone(zone);
        }}
      />

      <ImportTownBorderOverlay
        open={showImport && uiMode === 'view'}
        kind={importKind}
        townName={town.name}
        text={importText}
        promoteTemplate={promoteTemplate}
        saving={saving}
        onTextChange={setImportText}
        onPromoteChange={setPromoteTemplate}
        onClose={() => {
          setShowImport(false);
          setImportText('');
        }}
        onImport={() => {
          const text = importText.trim();
          if (!text) return;
          if (importKind === 'csv') {
            onImportCsv(text, promoteTemplate);
          } else {
            onImportGeoJson(text, promoteTemplate);
          }
          setShowImport(false);
          setImportText('');
        }}
      />
    </div>
  );
}

type ParishMapOverlayProps = {
  parish: DashParishRow;
  canWrite: boolean;
  saving: boolean;
  editing: boolean;
  onClose: () => void;
  onSetEditing: (v: boolean) => void;
  onSaveOutline: (polygon: DashZoneVertex[]) => void;
  onRequestEditFoundation: () => void;
};

function ParishMapOverlay({
  parish,
  canWrite,
  saving,
  editing,
  onClose,
  onSetEditing,
  onSaveOutline,
  onRequestEditFoundation,
}: ParishMapOverlayProps) {
  const foundation = parishFoundationVerts(parish);
  const townOverlays =
    parish.towns?.flatMap((t) =>
      includeZones(t).map((z) => ({
        id: z.id,
        kind: 'include' as const,
        polygon: z.polygon,
        name: t.name,
      })),
    ) ?? [];

  const zones = [
    {
      id: 'parish-foundation',
      kind: 'include' as const,
      polygon: foundation,
      name: `${parish.name} parish`,
    },
    ...townOverlays,
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/75"
        aria-label="Close map"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="parish-map-title"
        className="relative z-10 flex w-full max-w-6xl max-h-[94vh] flex-col rounded-xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
          <div className="flex-1 min-w-0">
            <h3 id="parish-map-title" className="font-semibold text-white truncate">
              {parish.name} · parish map
            </h3>
            <p className="text-xs text-slate-500">
              Parish foundation · {foundation.length >= 3 ? 'border set' : 'no border yet'} ·{' '}
              {(parish.towns ?? []).length} town{(parish.towns ?? []).length === 1 ? '' : 's'}
            </p>
          </div>
          {canWrite && !editing && (
            <button
              type="button"
              onClick={onRequestEditFoundation}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-sky-500/40 text-xs text-sky-300"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit parish border…
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-900"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs text-sky-200/90 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2">
            This is the parish foundation outline. Town borders (green) show for context. Customer
            delivery still uses each town’s border and non-delivery zones.
          </p>

          <ZoneMapEditor
            key={`${parish.id}-${editing ? 'edit' : 'view'}`}
            zones={zones}
            uiMode={editing ? 'adjust' : 'view'}
            initialPolygon={foundation}
            editingZoneId={editing ? 'parish-foundation' : null}
            townIncludePolygons={
              foundation.length >= 3
                ? [foundation]
                : townOverlays.map((z) => z.polygon).filter((p) => p.length >= 3)
            }
            saving={saving}
            foundationScope="parish"
            mapHeight={Math.min(560, typeof window !== 'undefined' ? window.innerHeight - 240 : 560)}
            onCancel={() => onSetEditing(false)}
            onSave={(payload) => onSaveOutline(payload.polygon)}
          />
        </div>
      </div>
    </div>
  );
}

export function MarketsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);
  const { confirm } = useAdminConfirm();

  const [parishes, setParishes] = useState<DashParishRow[]>([]);
  const [unassigned, setUnassigned] = useState<DashMarketRow[]>([]);
  const [markets, setMarkets] = useState<DashMarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateParish, setShowCreateParish] = useState(false);
  const [newParishName, setNewParishName] = useState('');
  const [addTownParishId, setAddTownParishId] = useState<string | null>(null);
  const [newTownName, setNewTownName] = useState('');
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [townExpanded, setTownExpanded] = useState<Record<string, boolean>>({});
  const [mapTownId, setMapTownId] = useState<string | null>(null);
  const [mapParishId, setMapParishId] = useState<string | null>(null);
  const [parishEditing, setParishEditing] = useState(false);
  const [tipTownId, setTipTownId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<MarketReadiness | null>(null);
  const [versions, setVersions] = useState<CoverageVersionRow[]>([]);
  const [activity, setActivity] = useState<ActivityLogRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await listMarkets(session.access_token);
      const towns = (res.markets ?? []).map(normalizeTown);
      setMarkets(towns);
      setParishes(
        (res.parishes ?? []).map((p) => normalizeParish(p)),
      );
      setUnassigned((res.unassigned ?? []).map(normalizeTown));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load markets');
      setMarkets([]);
      setParishes([]);
      setUnassigned([]);
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const findTown = (id: string) =>
    markets.find((m) => m.id === id) ??
    parishes.flatMap((p) => p.towns ?? []).find((m) => m.id === id) ??
    unassigned.find((m) => m.id === id);

  const mapTown = mapTownId ? findTown(mapTownId) : null;
  const mapParish = mapParishId ? parishes.find((p) => p.id === mapParishId) : null;

  const openTownMap = (townId: string, opts?: { editor?: EditorTarget }) => {
    setMapParishId(null);
    setParishEditing(false);
    setMapTownId(townId);
    setEditor(opts?.editor ?? null);
  };

  const closeTownMap = () => {
    setMapTownId(null);
    setEditor(null);
    setTipTownId(null);
    setReadiness(null);
  };

  const openParishMap = (parishId: string) => {
    setMapTownId(null);
    setEditor(null);
    setMapParishId(parishId);
    setParishEditing(false);
  };

  const closeParishMap = () => {
    setMapParishId(null);
    setParishEditing(false);
  };

  const saveParishOutline = async (polygon: DashZoneVertex[]) => {
    if (!mapParishId || !canWrite) return;
    setSaving(true);
    try {
      const res = await updateParishOutline(session.access_token, mapParishId, {
        polygon,
        confirm_foundation_edit: true,
        promote_template: true,
      });
      const name = res.parish?.name ?? mapParish?.name ?? 'this parish';
      toast.success(
        `Parish border saved (${polygon.length} points). This outline is now the default for ${name}.`,
      );
      setParishEditing(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const refreshOverlayMeta = useCallback(async () => {
    if (!mapTownId) return;
    try {
      const [r, v, a] = await Promise.all([
        getMarketReadiness(session.access_token, mapTownId),
        listCoverageVersions(session.access_token, mapTownId),
        listActivityLog(session.access_token, { q: 'roam_dash.coverage', limit: 20 }),
      ]);
      setReadiness(r);
      setVersions(v.versions ?? []);
      setActivity(
        (a.events ?? []).filter(
          (e) =>
            e.target_id === mapTownId ||
            e.action.includes('coverage') ||
            e.action.includes('zone_'),
        ),
      );
    } catch {
      // non-blocking
    }
  }, [mapTownId, session.access_token]);

  const toggleActive = async (m: DashMarketRow) => {
    if (!canWrite) return;
    const next = !m.is_active;
    try {
      await updateMarket(session.access_token, m.id, { is_active: next });
      toast.success(`${m.name} ${next ? 'activated' : 'paused'}`);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed';
      toast.error(msg);
      if (next) openTownMap(m.id);
    }
  };

  const submitParish = async () => {
    if (!canWrite || !newParishName.trim()) return;
    setSaving(true);
    try {
      await createParish(session.access_token, { name: newParishName.trim() });
      toast.success('Parish created');
      setShowCreateParish(false);
      setNewParishName('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const submitTown = async (parishId: string | null) => {
    if (!canWrite || !newTownName.trim()) return;
    setSaving(true);
    try {
      const res = await createMarket(session.access_token, {
        name: newTownName.trim(),
        is_active: false,
        parish_id: parishId,
      });
      toast.success('Town created with foundation border');
      setAddTownParishId(null);
      setNewTownName('');
      if (parishId) setCollapsed((c) => ({ ...c, [parishId]: false }));
      const createdId = res.market?.id;
      if (createdId) {
        setTipTownId(createdId);
        setTownExpanded((t) => ({ ...t, [createdId]: true }));
        setMapTownId(createdId);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const removeParish = async (p: DashParishRow) => {
    if (!canWrite) return;
    if (
      !window.confirm(
        `Delete parish “${p.name}”? Towns under it will become unassigned (not deleted).`,
      )
    ) {
      return;
    }
    try {
      await deleteParish(session.access_token, p.id);
      toast.success('Parish deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const saveEditor = async (payload: {
    polygon: DashZoneVertex[];
    source?: 'manual' | 'radius';
    center_lat?: number;
    center_lng?: number;
    radius_m?: number;
    nameHint?: string;
  }) => {
    if (!editor || !canWrite) return;
    setSaving(true);
    try {
      if (editor.mode === 'cutout' || editor.mode === 'radius') {
        const town = findTown(editor.marketId);
        const cutCount = town?.zones?.filter((z) => z.kind === 'exclude').length ?? 0;
        const name =
          editor.mode === 'radius'
            ? (payload.nameHint || `No delivery near pin ${cutCount + 1}`).slice(0, 80)
            : `No delivery ${cutCount + 1}`;
        await createZone(session.access_token, editor.marketId, {
          name,
          polygon: payload.polygon,
          kind: 'exclude',
          priority: 10,
          source: payload.source ?? (editor.mode === 'radius' ? 'radius' : 'manual'),
          center_lat: payload.center_lat,
          center_lng: payload.center_lng,
          radius_m: payload.radius_m,
        });
        toast.success('Non-delivery zone saved — publish when ready');
      } else {
        const isFoundation = editor.zone.kind === 'include';
        const updated = await updateZone(session.access_token, editor.marketId, editor.zone.id, {
          polygon: payload.polygon,
          kind: editor.zone.kind,
          source: payload.source ?? 'manual',
          ...(isFoundation
            ? { confirm_foundation_edit: true, promote_template: true }
            : {}),
        });
        const savedPts = Array.isArray(updated.zone?.polygon) ? updated.zone.polygon.length : 0;
        if (savedPts < 3) {
          toast.error('Border did not save correctly — try again');
          return;
        }
        if (isFoundation) {
          const town = findTown(editor.marketId);
          toast.success(
            `Town border saved (${savedPts} points). This outline is now the default for ${town?.name ?? 'this town'}. Publish when ready.`,
          );
        } else {
          toast.success('Non-delivery zone updated — publish when ready');
        }
      }
      setEditor(null);
      await load();
      await refreshOverlayMeta();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const removeZone = async (marketId: string, zone: DashZoneRow) => {
    if (!canWrite) return;
    const label = zone.kind === 'exclude' ? 'non-delivery zone' : 'town border';
    const ok = await confirm({
      title: `Delete ${label}?`,
      description: `Delete “${zone.name}”? Publish afterward if you want this change live for customers.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteZone(session.access_token, marketId, zone.id);
      toast.success(zone.kind === 'exclude' ? 'Non-delivery zone deleted' : 'Town border reset');
      if (editor && editor.mode === 'adjust' && editor.zone.id === zone.id) setEditor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const townProps = (town: DashMarketRow): TownCardProps => ({
    town,
    canWrite,
    expanded: townExpanded[town.id] === true,
    onToggleExpanded: () =>
      setTownExpanded((t) => ({ ...t, [town.id]: !(t[town.id] === true) })),
    onToggleActive: (m) => void toggleActive(m),
    onOpenMap: (opts) => openTownMap(town.id, opts),
    onRemoveZone: (id, z) => void removeZone(id, z),
  });

  const renderParishBlock = (p: DashParishRow) => {
    const isCollapsed = collapsed[p.id] !== false;
    const towns = p.towns ?? [];
    const hasParishBorder = parishFoundationVerts(p).length >= 3;
    return (
      <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-800/80">
          <button
            type="button"
            onClick={() => setCollapsed((c) => ({ ...c, [p.id]: !isCollapsed }))}
            className="p-1 rounded hover:bg-slate-800 text-slate-400"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white">{p.name}</h3>
            <p className="text-xs text-slate-500">
              Parish · {hasParishBorder ? 'border set' : 'no border yet'} · {towns.length} town
              {towns.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openParishMap(p.id)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-sky-500/40 bg-slate-900 text-xs text-sky-100 hover:bg-slate-800"
          >
            <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
            Open parish map
          </button>
          {canWrite && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCollapsed((c) => ({ ...c, [p.id]: false }));
                  setAddTownParishId(p.id);
                  setNewTownName('');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200"
              >
                <Plus className="w-3.5 h-3.5" />
                Add town
              </button>
              <button
                type="button"
                onClick={() => void removeParish(p)}
                className="p-1.5 rounded hover:bg-slate-800 text-red-400"
                title="Delete parish"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <div className="p-4 space-y-3">
            {addTownParishId === p.id && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-slate-400 mb-1">Town name</label>
                  <input
                    value={newTownName}
                    onChange={(e) => setNewTownName(e.target.value)}
                    placeholder="e.g. Portmore"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving || !newTownName.trim()}
                  onClick={() => void submitTown(p.id)}
                  className="px-3 py-2 rounded-lg bg-amber-500 text-slate-950 text-sm font-semibold disabled:opacity-50"
                >
                  Create town
                </button>
                <button
                  type="button"
                  onClick={() => setAddTownParishId(null)}
                  className="px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-300"
                >
                  Cancel
                </button>
              </div>
            )}

            {towns.length === 0 ? (
              <p className="text-xs text-slate-500">No towns in this parish yet.</p>
            ) : (
              towns.map((t) => <TownCard key={t.id} {...townProps(t)} />)
            )}
          </div>
        )}
      </div>
    );
  };

  const parishesWithTowns = parishes.filter((p) => (p.towns ?? []).length > 0);
  const emptyParishes = parishes.filter((p) => (p.towns ?? []).length === 0);

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Map className="w-5 h-5 text-emerald-400" />
            Delivery Markets
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Two foundations: parish border, then town border. Non-delivery zones sit on towns.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowCreateParish((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            New parish
          </button>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p className="font-medium text-amber-200">Ops playbook</p>
        <p className="mt-1 text-amber-100/80">
          Open parish map → set parish border once → Open town map → set town border → add
          non-delivery zones → Publish coverage → Activate. Customer delivery uses town borders
          only.
        </p>
      </div>

      {showCreateParish && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-400 mb-1">Parish name</label>
            <input
              value={newParishName}
              onChange={(e) => setNewParishName(e.target.value)}
              placeholder="e.g. St. Catherine"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
            />
          </div>
          <button
            type="button"
            disabled={saving || !newParishName.trim()}
            onClick={() => void submitParish()}
            className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 text-sm font-semibold disabled:opacity-50"
          >
            Create parish
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {parishesWithTowns.map(renderParishBlock)}

          {unassigned.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/80">
                <h3 className="font-semibold text-white">Unassigned towns</h3>
                <p className="text-xs text-slate-500">Not linked to a parish yet</p>
              </div>
              <div className="p-4 space-y-3">
                {unassigned.map((t) => (
                  <TownCard key={t.id} {...townProps(t)} />
                ))}
              </div>
            </div>
          )}

          {emptyParishes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Parishes without towns
              </p>
              {emptyParishes.map(renderParishBlock)}
            </div>
          )}

          {parishes.length === 0 && unassigned.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-12 text-center text-slate-500 text-sm">
              No parishes yet — create one to start adding towns.
            </div>
          )}
        </div>
      )}

      {mapTown && (
        <TownMapOverlay
          town={mapTown}
          canWrite={canWrite}
          saving={saving}
          editor={editor}
          accessToken={session.access_token}
          showTip={tipTownId === mapTown.id}
          readiness={readiness}
          versions={versions}
          activity={activity}
          onClose={closeTownMap}
          onSetEditor={setEditor}
          onSaveEditor={(payload) => void saveEditor(payload)}
          onRefreshReadiness={() => void refreshOverlayMeta()}
          onRequestEditFoundationOnMap={() => {
            const delivery = primaryDeliveryArea(mapTown);
            if (!delivery) {
              toast.error('Town border missing — reload the page to restore it');
              return;
            }
            void (async () => {
              const ok = await confirm({
                title: 'Edit town border on the map?',
                description:
                  'You’ll redraw the green delivery foundation for this town. Non-delivery zones stay; publish when you’re done.',
                confirmLabel: 'Edit on map',
              });
              if (!ok) return;
              setEditor({
                mode: 'adjust',
                marketId: mapTown.id,
                zone: delivery,
              });
            })();
          }}
          onRequestEditFoundationCoordinates={() => {
            const delivery = primaryDeliveryArea(mapTown);
            if (!delivery) {
              toast.error('Town border missing — reload the page to restore it');
              return;
            }
            setEditor({
              mode: 'adjust',
              marketId: mapTown.id,
              zone: delivery,
              openCoordinates: true,
            });
          }}
          onRemoveZone={(zone) => void removeZone(mapTown.id, zone)}
          onPublish={() => {
            void (async () => {
              setSaving(true);
              try {
                await publishMarketCoverage(session.access_token, mapTown.id);
                toast.success('Coverage published');
                await load();
                await refreshOverlayMeta();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Publish failed');
              } finally {
                setSaving(false);
              }
            })();
          }}
          onRestore={(versionId) => {
            void (async () => {
              if (!window.confirm('Restore this version into draft and re-publish?')) return;
              setSaving(true);
              try {
                await restoreCoverageVersion(session.access_token, mapTown.id, versionId, true);
                toast.success('Version restored and published');
                await load();
                await refreshOverlayMeta();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Restore failed');
              } finally {
                setSaving(false);
              }
            })();
          }}
          onImportGeoJson={(text, promote) => {
            void (async () => {
              setSaving(true);
              try {
                let payload: { polygon?: DashZoneVertex[]; geojson?: unknown; promote_template?: boolean } = {
                  promote_template: promote,
                };
                try {
                  const parsed = JSON.parse(text) as unknown;
                  if (Array.isArray(parsed)) {
                    payload.polygon = parsed as DashZoneVertex[];
                  } else {
                    // geojson.io exports FeatureCollection — unwrap to lat/lng ring
                    const ring = polygonFromGeoJson(parsed);
                    if (ring) {
                      payload.polygon = ring;
                    } else {
                      payload.geojson = parsed;
                    }
                  }
                } catch {
                  toast.error('Invalid JSON');
                  setSaving(false);
                  return;
                }
                if (!payload.polygon && !payload.geojson) {
                  toast.error('Need a Polygon (or FeatureCollection with one)');
                  setSaving(false);
                  return;
                }
                await importMarketGeoJson(session.access_token, mapTown.id, payload);
                toast.success('Town border imported — publish when ready');
                await load();
                await refreshOverlayMeta();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Import failed');
              } finally {
                setSaving(false);
              }
            })();
          }}
          onImportCsv={(text, promote) => {
            void (async () => {
              const polygon = parsePolygonCsv(text);
              if (!polygon) {
                toast.error('CSV needs at least 3 valid lat,lng rows');
                return;
              }
              setSaving(true);
              try {
                await importMarketGeoJson(session.access_token, mapTown.id, {
                  polygon,
                  promote_template: promote,
                });
                toast.success(`Town border imported (${polygon.length} points) — publish when ready`);
                await load();
                await refreshOverlayMeta();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Import failed');
              } finally {
                setSaving(false);
              }
            })();
          }}
        />
      )}

      {mapParish && (
        <ParishMapOverlay
          parish={mapParish}
          canWrite={canWrite}
          saving={saving}
          editing={parishEditing}
          onClose={closeParishMap}
          onSetEditing={setParishEditing}
          onSaveOutline={(polygon) => void saveParishOutline(polygon)}
          onRequestEditFoundation={() => {
            void (async () => {
              const ok = await confirm({
                title: 'Edit parish foundation border?',
                description:
                  'This is the parish base outline. Only change it if the real parish boundary is wrong. Town delivery borders and cutouts are edited on each town map.',
                confirmLabel: 'Edit parish border',
              });
              if (!ok) return;
              setParishEditing(true);
            })();
          }}
        />
      )}
    </div>
  );
}
