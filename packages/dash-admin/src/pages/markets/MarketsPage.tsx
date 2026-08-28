import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Crosshair,
  History,
  Loader2,
  Map,
  MapPin,
  Maximize2,
  Minimize2,
  Plus,
  Pencil,
  Trash2,
  Satellite,
  Scissors,
  Download,
  FileUp,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import {
  checkCoveragePoint,
  createMarket,
  createParish,
  createTownFromBoundary,
  createZone,
  deleteMarket,
  deleteParish,
  deleteZone,
  fetchCustomerDeliveryZones,
  getMarketReadiness,
  importMarketGeoJson,
  listActivityLog,
  listAdminBoundaries,
  listCoverageVersions,
  listMarkets,
  publishMarketCoverage,
  previewMarketCoverageDiff,
  fetchMarketCoverageCells,
  restoreCoverageVersion,
  formatMerchantRecomputeToast,
  promoteMarketBoundary,
  unionCommunitiesToMarket,
  updateMarket,
  updateParish,
  updateParishOutline,
  updateParishTownPins,
  updateZone,
  type ActivityLogRow,
  type CoverageVersionRow,
  type DashAdminBoundary,
  type DashMarketRow,
  type DashParishRow,
  type DashParishTownPin,
  type DashZoneRow,
  type DashZoneVertex,
  type MarketReadiness,
  type ParishModeSuggestion,
  type ReadinessCheck,
} from '@roam/dash-admin-client';
import { sanitizeVertices, createAdminCoverageLayers, type ActiveCoverageZone } from '@roam/dash-coverage';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { ZoneMapEditor, type ZoneMapUiMode } from './ZoneMapEditor';
import { JamaicaOverviewMap } from './JamaicaOverviewMap';
import { detectCoverageConflicts, hasBlockingCoverageConflicts } from './coverageGeo';
import { ManageZonesOverlay } from './ManageZonesOverlay';
import { ImportTownBorderOverlay } from './ImportTownBorderOverlay';
import { ImportParishTownPinsOverlay } from './ImportParishTownPinsOverlay';
import { ImportBoundariesWizard } from './ImportBoundariesWizard';
import {
  ExclusionDetailSheet,
  defaultExclusionForm,
  exclusionStatusLabel,
  formFromZone,
  type ExclusionFormValues,
} from './ExclusionDetailSheet';
import { PlatformExclusionsPanel } from './PlatformExclusionsPanel';
import {
  downloadTextFile,
  parsePolygonCsv,
  pinsFromGeoJson,
  polygonFromGeoJson,
  isLegacyGeoJsonBlocked,
  LEGACY_IMPORT_BLOCKED_MESSAGE,
  polygonToCsv,
  polygonToGeoJson,
  slugFilename,
  zonesToCsv,
} from './coverageIo';

function ProvenanceBadge({
  source,
  validOn,
}: {
  source?: string | null;
  validOn?: string | null;
}) {
  if (!source) return null;
  const parts = ['Official', source];
  if (validOn) parts.push(validOn);
  return (
    <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
      {parts.join(' · ')}
    </span>
  );
}

const adminCoverageLayers = createAdminCoverageLayers({
  fetchPublishedZones: fetchCustomerDeliveryZones,
});

function normalizeZone(z: DashZoneRow): DashZoneRow {
  return {
    ...z,
    kind: z.kind === 'exclude' ? 'exclude' : 'include',
    polygon: sanitizeVertices(z.polygon) as DashZoneVertex[],
    priority: Number.isFinite(z.priority) ? z.priority : 0,
  };
}

function offerParishModeSuggestion(
  token: string,
  suggestion: ParishModeSuggestion | null | undefined,
  onReload: () => Promise<void>,
) {
  if (!suggestion) return;
  const modeLabel = suggestion.suggested === 'parish_boundary' ? 'Parish border' : 'Town zones';
  // Stable id so a second publish/reload cannot stack another copy of the same tip.
  toast(suggestion.reason, {
    id: `parish-mode-${suggestion.parish_id}-${suggestion.suggested}`,
    duration: 20000,
    action: {
      label: `Apply ${modeLabel}`,
      onClick: () => {
        void (async () => {
          try {
            await updateParish(token, suggestion.parish_id, { coverage_mode: suggestion.suggested });
            toast.success(`${suggestion.parish_name} set to ${modeLabel}`);
            await onReload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to update parish mode');
          }
        })();
      },
    },
  });
}

function normalizeTown(m: DashMarketRow): DashMarketRow {
  return { ...m, zones: (m.zones ?? []).map(normalizeZone) };
}

function normalizeParish(p: DashParishRow): DashParishRow {
  const pins = Array.isArray(p.town_pins) ? p.town_pins : [];
  return {
    ...p,
    foundation_polygon: sanitizeVertices(p.foundation_polygon) as DashZoneVertex[],
    town_pins: pins
      .filter((pin) => pin && Number.isFinite(pin.lat) && Number.isFinite(pin.lng))
      .map((pin) => ({
        name: String(pin.name ?? 'Unnamed'),
        lat: Number(pin.lat),
        lng: Number(pin.lng),
        properties: pin.properties,
      })),
    towns: (p.towns ?? []).map(normalizeTown),
  };
}

function parishTownPins(p: DashParishRow): DashParishTownPin[] {
  return p.town_pins ?? [];
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
  parishBoundaryMode?: boolean;
  parishPcode?: string | null;
  accessToken?: string;
  onToggleExpanded: () => void;
  onToggleActive: (m: DashMarketRow) => void;
  onOpenMap: (opts?: { editor?: EditorTarget }) => void;
  onRemoveZone: (marketId: string, zone: DashZoneRow) => void;
  onEditExclusionMeta?: (marketId: string, zone: DashZoneRow) => void;
  onDeleteTown: (town: DashMarketRow) => void | Promise<void>;
  onApplyOfficialBorder: (town: DashMarketRow) => void | Promise<void>;
  onCommunitiesUnioned?: () => void;
};

function TownCard({
  town: m,
  canWrite,
  expanded,
  parishBoundaryMode,
  parishPcode,
  accessToken,
  onToggleExpanded,
  onToggleActive,
  onOpenMap,
  onRemoveZone,
  onEditExclusionMeta,
  onDeleteTown,
  onApplyOfficialBorder,
  onCommunitiesUnioned,
}: TownCardProps) {
  const zones = m.zones ?? [];
  const includes = zones.filter((z) => z.kind === 'include');
  const excludes = zones.filter((z) => z.kind === 'exclude');
  const townPcode = m.pcode?.trim() || null;
  const [showUnion, setShowUnion] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [communities, setCommunities] = useState<
    Array<{ pcode: string; name: string }>
  >([]);
  const [selectedPcodes, setSelectedPcodes] = useState<string[]>([]);
  const [unionBusy, setUnionBusy] = useState(false);

  useEffect(() => {
    if (!showUnion || !accessToken || !parishPcode) return;
    let cancelled = false;
    void listAdminBoundaries(accessToken, { admin_level: 3 })
      .then((r) => {
        if (cancelled) return;
        setCommunities(
          (r.boundaries ?? [])
            .filter((b) =>
              townPcode
                ? b.parent_pcode === townPcode
                : String(b.parent_pcode ?? '').startsWith(parishPcode),
            )
            .map((b) => ({ pcode: b.pcode, name: b.name })),
        );
      })
      .catch(() => {
        if (!cancelled) setCommunities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showUnion, accessToken, parishPcode, townPcode]);

  const applyOfficialBorder = async () => {
    if (!townPcode) return;
    setApplyBusy(true);
    try {
      await onApplyOfficialBorder(m);
    } finally {
      setApplyBusy(false);
    }
  };

  const runUnion = async () => {
    if (!accessToken || selectedPcodes.length === 0) return;
    setUnionBusy(true);
    try {
      await unionCommunitiesToMarket(accessToken, m.id, selectedPcodes, m.name);
      toast.success(`Built border from ${selectedPcodes.length} communities`);
      setShowUnion(false);
      setSelectedPcodes([]);
      onCommunitiesUnioned?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Union failed');
    } finally {
      setUnionBusy(false);
    }
  };

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
            {parishBoundaryMode ? (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300">
                Uses parish border
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
          <>
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
            <button
              type="button"
              onClick={() => onDeleteTown(m)}
              className="p-1.5 rounded hover:bg-slate-800 text-red-400"
              title="Delete town"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
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
                  {exclusionStatusLabel(z) ? (
                    <span className="text-[10px] text-slate-500">{exclusionStatusLabel(z)}</span>
                  ) : null}
                  {canWrite && (
                    <div className="ml-auto flex items-center gap-1">
                      {onEditExclusionMeta ? (
                        <button
                          type="button"
                          onClick={() => onEditExclusionMeta(m.id, z)}
                          className="px-2 py-1 rounded text-[10px] text-slate-400 hover:bg-slate-800"
                        >
                          Details
                        </button>
                      ) : null}
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
              {townPcode && includes.length === 0 ? (
                <button
                  type="button"
                  disabled={applyBusy}
                  onClick={() => void applyOfficialBorder()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/40 text-xs text-emerald-200 disabled:opacity-50"
                >
                  {applyBusy ? 'Applying…' : `Apply official border (${townPcode})`}
                </button>
              ) : null}
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
              {parishPcode && accessToken ? (
                <button
                  type="button"
                  onClick={() => setShowUnion((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/40 text-xs text-amber-200"
                >
                  Build from communities…
                </button>
              ) : null}
            </div>
          )}

          {showUnion && parishPcode && (
            <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 space-y-2">
              <p className="text-xs text-slate-400">
                {townPcode
                  ? `Pick admin3 communities under ${m.name} (${townPcode}) to build the delivery border.`
                  : 'These towns often sit at community level — pick admin3 communities under this parish to build the delivery border.'}
              </p>
              {communities.length === 0 ? (
                <p className="text-xs text-slate-500">No communities in catalog for this parish.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {communities.map((c) => {
                    const checked = selectedPcodes.includes(c.pcode);
                    return (
                      <label
                        key={c.pcode}
                        className="flex items-center gap-2 text-xs text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedPcodes((prev) =>
                              checked
                                ? prev.filter((p) => p !== c.pcode)
                                : [...prev, c.pcode],
                            )
                          }
                        />
                        <span>
                          {c.name}{' '}
                          <span className="text-slate-500">({c.pcode})</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={unionBusy || selectedPcodes.length === 0}
                  onClick={() => void runUnion()}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold disabled:opacity-50"
                >
                  {unionBusy ? 'Building…' : `Union ${selectedPcodes.length || ''}`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUnion(false);
                    setSelectedPcodes([]);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type MapOverlayProps = {
  town: DashMarketRow;
  /** Other towns in the same parish — shown as muted context on the map. */
  siblingTowns: DashMarketRow[];
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
  recomputeLocked: boolean;
  onRecomputeLockedChange: (value: boolean) => void;
  unlockAfter: boolean;
  onUnlockAfterChange: (value: boolean) => void;
  onImportGeoJson: (text: string, promote: boolean) => void;
  onImportCsv: (text: string, promote: boolean) => void;
  onRefreshReadiness: () => void;
  onRequestEditFoundationOnMap: () => void;
  onRequestEditFoundationCoordinates: () => void;
  onRemoveZone: (zone: DashZoneRow) => void;
  onRenameTown: (nextName: string) => void | Promise<void>;
};

function TownMapOverlay({
  town,
  siblingTowns,
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
  recomputeLocked,
  onRecomputeLockedChange,
  unlockAfter,
  onUnlockAfterChange,
  onImportGeoJson,
  onImportCsv,
  onRefreshReadiness,
  onRequestEditFoundationOnMap,
  onRequestEditFoundationCoordinates,
  onRemoveZone,
  onRenameTown,
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
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [showOptsMenu, setShowOptsMenu] = useState(false);
  const [showMapToolsMenu, setShowMapToolsMenu] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState(town.name);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [showHexOverlay, setShowHexOverlay] = useState(false);
  const [testActive, setTestActive] = useState(false);
  const [showCustomerCoverage, setShowCustomerCoverage] = useState(false);
  const [publishedZones, setPublishedZones] = useState<ActiveCoverageZone[]>([]);
  const [draftDiffersFromLive, setDraftDiffersFromLive] = useState(false);
  const [hexCells, setHexCells] = useState<Array<{ h3_cell: string; kind: string }>>([]);
  /** Near-fullscreen map workspace for tracing borders. */
  const [mapExpanded, setMapExpanded] = useState(false);
  const ioMenuRef = useRef<HTMLDivElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const optsMenuRef = useRef<HTMLDivElement>(null);
  const mapToolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRenameValue(town.name);
  }, [town.id, town.name]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchMarketCoverageCells(accessToken, town.id, 7);
        if (!cancelled) setHexCells(res.cells ?? []);
      } catch {
        if (!cancelled) setHexCells([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, town.id, town.published_version_id, town.draft_dirty]);

  useEffect(() => {
    if (!showCustomerCoverage) {
      setPublishedZones([]);
      setDraftDiffersFromLive(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const live = await adminCoverageLayers.loadPublished();
        if (cancelled) return;
        setPublishedZones(live);
        setDraftDiffersFromLive(
          adminCoverageLayers.draftDiffersFromPublished(zones, town.id),
        );
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load customer coverage');
          setShowCustomerCoverage(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCustomerCoverage, town.id, zones]);

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
    if (!showIoMenu && !showEditMenu && !showOptsMenu && !showMapToolsMenu) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (showIoMenu && ioMenuRef.current && !ioMenuRef.current.contains(t)) {
        setShowIoMenu(false);
      }
      if (showEditMenu && editMenuRef.current && !editMenuRef.current.contains(t)) {
        setShowEditMenu(false);
      }
      if (showOptsMenu && optsMenuRef.current && !optsMenuRef.current.contains(t)) {
        setShowOptsMenu(false);
      }
      if (showMapToolsMenu && mapToolsMenuRef.current && !mapToolsMenuRef.current.contains(t)) {
        setShowMapToolsMenu(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showIoMenu, showEditMenu, showOptsMenu, showMapToolsMenu]);

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
            <h3 id="town-map-title" className="font-semibold text-white truncate flex items-center gap-2">
              <span className="truncate">
                {town.name} · map
                {mapExpanded ? (
                  <span className="ml-2 text-xs font-normal text-sky-300">· expanded</span>
                ) : null}
              </span>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => {
                    setRenameValue(town.name);
                    setShowRename(true);
                  }}
                  className="shrink-0 p-1 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
                  title="Rename town"
                  aria-label="Rename town"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </h3>
            <p className="text-xs text-slate-300">
              {town.is_active ? 'Active' : 'Inactive'}
              {town.draft_dirty ? ' · unpublished draft changes' : ' · published'}
              {!town.draft_dirty && hexCells.length === 0
                ? ' · hex grid not built yet — Publish once'
                : null}
            </p>
          </div>
          {canWrite && uiMode === 'view' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative" ref={editMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditMenu((v) => !v);
                    setShowIoMenu(false);
                    setShowOptsMenu(false);
                    setShowMapToolsMenu(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-500 bg-slate-800 text-xs text-white font-medium"
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-300" />
                  Edit zones
                  {excludes.length > 0 ? ` (${excludes.length})` : ''}
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {showEditMenu && (
                  <div className="absolute right-0 top-full mt-1 z-30 w-60 rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-slate-100 hover:bg-slate-800"
                      onClick={() => {
                        setShowEditMenu(false);
                        setRenameValue(town.name);
                        setShowRename(true);
                      }}
                    >
                      Rename town…
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-slate-100 hover:bg-slate-800"
                      onClick={() => {
                        setShowEditMenu(false);
                        setShowManageZones(true);
                      }}
                    >
                      Manage zones…
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-red-200 hover:bg-slate-800"
                      onClick={() => {
                        setShowEditMenu(false);
                        onSetEditor({ mode: 'radius', marketId: town.id });
                      }}
                    >
                      Don’t deliver near here
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-red-200 hover:bg-slate-800"
                      onClick={() => {
                        setShowEditMenu(false);
                        onSetEditor({ mode: 'cutout', marketId: town.id });
                      }}
                    >
                      Draw non-delivery zone
                    </button>
                    {delivery ? (
                      <>
                        <div className="my-1 border-t border-slate-800" />
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
                          onClick={() => {
                            setShowEditMenu(false);
                            onRemoveZone(delivery);
                          }}
                        >
                          Delete town border…
                        </button>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="relative" ref={ioMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowIoMenu((v) => !v);
                    setShowEditMenu(false);
                    setShowOptsMenu(false);
                    setShowMapToolsMenu(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-500 text-xs text-slate-100"
                >
                  <Download className="w-3.5 h-3.5" />
                  Import / Export
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {showIoMenu && (
                  <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1">
                    <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400">
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
                    <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400">
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
              <div className="relative" ref={optsMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowOptsMenu((v) => !v);
                    setShowEditMenu(false);
                    setShowIoMenu(false);
                    setShowMapToolsMenu(false);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                    showCustomerCoverage || recomputeLocked
                      ? 'border-sky-500/40 bg-sky-500/10 text-sky-100'
                      : 'border-slate-500 text-slate-100'
                  }`}
                >
                  Options
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {showOptsMenu && (
                  <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-2 px-3 space-y-2.5">
                    <label className="flex items-start gap-2 text-xs text-slate-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showCustomerCoverage}
                        onChange={(e) => setShowCustomerCoverage(e.target.checked)}
                        className="mt-0.5 rounded border-slate-500"
                      />
                      <span>
                        Show customer coverage
                        {draftDiffersFromLive ? (
                          <span className="block text-amber-300 mt-0.5">Draft differs from live</span>
                        ) : null}
                      </span>
                    </label>
                    <div className="border-t border-slate-800 pt-2 space-y-2">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">On publish</p>
                      <label className="flex items-start gap-2 text-xs text-slate-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={recomputeLocked}
                          onChange={(e) => onRecomputeLockedChange(e.target.checked)}
                          className="mt-0.5 rounded border-slate-500"
                        />
                        Include locked merchants
                      </label>
                      <label
                        className={`flex items-start gap-2 text-xs cursor-pointer ${
                          recomputeLocked ? 'text-slate-100' : 'text-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={unlockAfter}
                          disabled={!recomputeLocked}
                          onChange={(e) => onUnlockAfterChange(e.target.checked)}
                          className="mt-0.5 rounded border-slate-500"
                        />
                        Also unlock for auto updates
                      </label>
                    </div>
                  </div>
                )}
              </div>
              <div className="relative" ref={mapToolsMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowMapToolsMenu((v) => !v);
                    setShowEditMenu(false);
                    setShowIoMenu(false);
                    setShowOptsMenu(false);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                    showHexOverlay || testActive || mapType === 'hybrid'
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                      : 'border-slate-500 text-slate-100'
                  }`}
                >
                  Map tools
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
                {showMapToolsMenu && (
                  <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-slate-100 hover:bg-slate-800"
                      onClick={() => setMapType((t) => (t === 'roadmap' ? 'hybrid' : 'roadmap'))}
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
                        onClick={() => setShowHexOverlay((v) => !v)}
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
                    <button
                      type="button"
                      className={`w-full flex items-center gap-2 text-left px-3 py-2 text-xs hover:bg-slate-800 ${
                        testActive ? 'text-amber-200' : 'text-slate-100'
                      }`}
                      onClick={() => setTestActive((v) => !v)}
                    >
                      <Crosshair className="w-3.5 h-3.5 shrink-0" />
                      {testActive ? 'Test pin (on)' : 'Test pin'}
                      {testActive ? <Check className="w-3.5 h-3.5 ml-auto" /> : null}
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={saving || (!town.draft_dirty && hexCells.length > 0)}
                onClick={onPublish}
                title={
                  !town.draft_dirty && hexCells.length === 0
                    ? 'Builds the H3 hex grid for this town (no border change needed)'
                    : undefined
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold disabled:opacity-40"
              >
                {hexCells.length === 0 && !town.draft_dirty
                  ? 'Publish & build hexes'
                  : 'Publish coverage'}
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setMapExpanded((v) => !v)}
              className={`p-2 rounded-lg border ${
                mapExpanded
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-900'
              }`}
              title={mapExpanded ? 'Shrink map' : 'Expand map'}
              aria-label={mapExpanded ? 'Shrink map' : 'Expand map'}
            >
              {mapExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
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
        </div>

        <div
          className={`flex-1 overflow-y-auto space-y-3 ${
            mapExpanded ? 'p-2 sm:p-3 flex flex-col min-h-0' : 'p-4'
          }`}
        >
          {!mapExpanded && showTip && (
            <p className="text-xs text-emerald-200/90 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              Green is this town’s live delivery border. Red zones are where you don’t deliver.
              Neighbor towns (gray) are reference only. Use{' '}
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
                    {ch.detail ? <span className="block text-[11px] mt-0.5 opacity-95">{ch.detail}</span> : null}
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
              contextTownPolygons={siblingTowns.flatMap((t) =>
                includeZones(t).map((z) => ({
                  id: `${t.id}-${z.id}`,
                  name: t.name,
                  polygon: z.polygon,
                  isActive: Boolean(t.is_active),
                })),
              )}
              uiMode={uiMode}
              initialPolygon={initialPolygon}
              editingZoneId={editingZoneId}
              townIncludePolygons={includeZones(town).map((z) => z.polygon)}
              publishedZones={showCustomerCoverage ? publishedZones : []}
              hexCells={hexCells}
              mapToolsPlacement={canWrite && uiMode === 'view' ? 'none' : 'inline'}
              mapType={mapType}
              onMapTypeChange={setMapType}
              showHexOverlay={showHexOverlay}
              onShowHexOverlayChange={setShowHexOverlay}
              testActive={testActive}
              onTestActiveChange={setTestActive}
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
        onDeleteTownBorder={(zone) => {
          setShowManageZones(false);
          onRemoveZone(zone);
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

      {showRename ? (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px]"
            onClick={() => {
              setShowRename(false);
              setRenameValue(town.name);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-town-title"
            className="relative w-full max-w-md overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div>
                <h2 id="rename-town-title" className="text-base font-semibold text-white">
                  Rename town
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Updates the display name everywhere this town appears.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRename(false);
                  setRenameValue(town.name);
                }}
                className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                aria-label="Close rename"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              className="p-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const next = renameValue.trim();
                if (!next || next === town.name) {
                  setShowRename(false);
                  return;
                }
                void (async () => {
                  await onRenameTown(next);
                  setShowRename(false);
                })();
              }}
            >
              <div>
                <label htmlFor="rename-town-input" className="block text-xs text-slate-400 mb-1">
                  Town name
                </label>
                <input
                  id="rename-town-input"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="e.g. Kingston"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRename(false);
                    setRenameValue(town.name);
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !renameValue.trim() || renameValue.trim() === town.name}
                  className="px-3 py-2 rounded-lg bg-amber-500 text-slate-950 text-sm font-semibold disabled:opacity-50"
                >
                  Save name
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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
  accessToken: string;
  canWrite: boolean;
  saving: boolean;
  editing: boolean;
  onClose: () => void;
  onSetEditing: (v: boolean) => void;
  onSaveOutline: (polygon: DashZoneVertex[], promoteTemplate?: boolean) => void | Promise<void>;
  onSaveTownPins: (pins: DashParishTownPin[]) => void;
  onRequestEditFoundation: () => void;
  /** Confirm foundation edit; returns true if import may proceed. */
  onRequestImportGeoJson: () => Promise<boolean>;
};

function ParishMapOverlay({
  parish,
  accessToken,
  canWrite,
  saving,
  editing,
  onClose,
  onSetEditing,
  onSaveOutline,
  onSaveTownPins,
  onRequestEditFoundation,
  onRequestImportGeoJson,
}: ParishMapOverlayProps) {
  const foundation = parishFoundationVerts(parish);
  const townPins = parishTownPins(parish);
  const contextTownPolygons =
    parish.towns?.flatMap((t) =>
      includeZones(t).map((z) => ({
        id: `${t.id}-${z.id}`,
        name: t.name,
        polygon: z.polygon,
        isActive: Boolean(t.is_active),
      })),
    ) ?? [];

  const zones = [
    {
      id: 'parish-foundation',
      kind: 'include' as const,
      polygon: foundation,
      name: `${parish.name} parish`,
    },
  ];

  const [showImport, setShowImport] = useState(false);
  const [showPinImport, setShowPinImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [pinImportText, setPinImportText] = useState('');
  const [promoteTemplate, setPromoteTemplate] = useState(true);
  const [showParishTools, setShowParishTools] = useState(false);
  const [showMapToolsMenu, setShowMapToolsMenu] = useState(false);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [showHexOverlay, setShowHexOverlay] = useState(false);
  const [testActive, setTestActive] = useState(false);
  const parishToolsRef = useRef<HTMLDivElement>(null);
  const mapToolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!showParishTools && !showMapToolsMenu) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (showParishTools && parishToolsRef.current && !parishToolsRef.current.contains(t)) {
        setShowParishTools(false);
      }
      if (showMapToolsMenu && mapToolsMenuRef.current && !mapToolsMenuRef.current.contains(t)) {
        setShowMapToolsMenu(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showParishTools, showMapToolsMenu]);

  const openImport = () => {
    void (async () => {
      const ok = await onRequestImportGeoJson();
      if (!ok) return;
      setShowImport(true);
    })();
  };

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
            <p className="text-xs text-slate-300">
              Parish foundation · {foundation.length >= 3 ? 'border set' : 'no border yet'} ·{' '}
              {(parish.towns ?? []).length} town{(parish.towns ?? []).length === 1 ? '' : 's'}
              {townPins.length > 0
                ? ` · ${townPins.length} legacy pin${townPins.length === 1 ? '' : 's'}`
                : ''}
              {editing ? ' · editing border' : null}
            </p>
          </div>
          {canWrite && (
            <div className="relative" ref={parishToolsRef}>
              <button
                type="button"
                onClick={() => {
                  setShowParishTools((v) => !v);
                  setShowMapToolsMenu(false);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-500 bg-slate-800 text-xs text-white font-medium"
              >
                <Pencil className="w-3.5 h-3.5 text-sky-300" />
                Parish tools
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
              {showParishTools && (
                <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs text-sky-100 hover:bg-slate-800"
                    onClick={() => {
                      setShowParishTools(false);
                      setShowPinImport(true);
                    }}
                  >
                    Import town pins (legacy)…
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs text-amber-100 hover:bg-slate-800"
                    onClick={() => {
                      setShowParishTools(false);
                      if (editing) setShowImport(true);
                      else openImport();
                    }}
                  >
                    Import parish border…
                  </button>
                  {!editing ? (
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-sky-100 hover:bg-slate-800"
                      onClick={() => {
                        setShowParishTools(false);
                        onRequestEditFoundation();
                      }}
                    >
                      Edit parish border…
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          )}
          <div className="relative" ref={mapToolsMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowMapToolsMenu((v) => !v);
                setShowParishTools(false);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                showHexOverlay || testActive || mapType === 'hybrid'
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                  : 'border-slate-500 text-slate-100'
              }`}
            >
              Map tools
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {showMapToolsMenu && (
              <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-slate-100 hover:bg-slate-800"
                  onClick={() => setMapType((t) => (t === 'roadmap' ? 'hybrid' : 'roadmap'))}
                >
                  <Satellite className="w-3.5 h-3.5 shrink-0" />
                  {mapType === 'hybrid' ? 'Satellite (on)' : 'Satellite'}
                </button>
                <p className="px-3 py-2 text-xs text-slate-400" title="Hex overlay is for town maps after publish">
                  Hex overlay (town maps only)
                </p>
                <button
                  type="button"
                  className={`w-full flex items-center gap-2 text-left px-3 py-2 text-xs hover:bg-slate-800 ${
                    testActive ? 'text-amber-200' : 'text-slate-100'
                  }`}
                  onClick={() => setTestActive((v) => !v)}
                >
                  <Crosshair className="w-3.5 h-3.5 shrink-0" />
                  {testActive ? 'Test pin (on)' : 'Test pin'}
                  {testActive ? <Check className="w-3.5 h-3.5 ml-auto" /> : null}
                </button>
              </div>
            )}
          </div>
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
          <p className="text-xs text-slate-200/90 rounded-lg border border-slate-500/40 bg-slate-500/10 px-3 py-2">
            Editing parish outline.
            {parish.coverage_mode === 'parish_boundary'
              ? ' Parish border mode — this outline is live customer delivery.'
              : ' Town zones mode — this outline is an outer gate on town delivery.'}
          </p>

          <ZoneMapEditor
            key={`${parish.id}-${editing ? 'edit' : 'view'}`}
            zones={zones}
            contextTownPolygons={contextTownPolygons}
            showNeighborToggle={false}
            uiMode={editing ? 'adjust' : 'view'}
            initialPolygon={foundation}
            editingZoneId={editing ? 'parish-foundation' : null}
            townIncludePolygons={
              foundation.length >= 3
                ? [foundation]
                : contextTownPolygons.map((t) => t.polygon).filter((p) => p.length >= 3)
            }
            foundationScope="parish"
            referenceTownPins={townPins.map((pin, idx) => ({
              id: `${parish.id}-pin-${idx}`,
              name: pin.name,
              lat: pin.lat,
              lng: pin.lng,
            }))}
            mapHeight={520}
            saving={saving}
            mapToolsPlacement="none"
            mapType={mapType}
            onMapTypeChange={setMapType}
            showHexOverlay={showHexOverlay}
            onShowHexOverlayChange={setShowHexOverlay}
            testActive={testActive}
            onTestActiveChange={setTestActive}
            onTestPoint={(lat, lng) => checkCoveragePoint(accessToken, lat, lng)}
            onCancel={() => onSetEditing(false)}
          onSaveOutline={async (polygon, promote) => {
            await onSaveOutline(polygon, promote);
          }}
          />
        </div>
      </div>

      <ImportTownBorderOverlay
        open={showImport}
        kind="geojson"
        scope="parish"
        townName={parish.name}
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
          void (async () => {
            const text = importText.trim();
            if (!text) return;
            let parsed: unknown;
            try {
              parsed = JSON.parse(text);
            } catch {
              toast.error('Invalid JSON');
              return;
            }
            if (!Array.isArray(parsed) && isLegacyGeoJsonBlocked(parsed)) {
              toast.error(LEGACY_IMPORT_BLOCKED_MESSAGE);
              return;
            }
            const ring = Array.isArray(parsed)
              ? (parsed as DashZoneVertex[])
              : polygonFromGeoJson(parsed);
            if (!ring || ring.length < 3) {
              toast.error(
                isLegacyGeoJsonBlocked(parsed)
                  ? LEGACY_IMPORT_BLOCKED_MESSAGE
                  : 'Need a single-ring Polygon (or Feature with one). Use Import Boundaries for official files.',
              );
              return;
            }
            setShowImport(false);
            setImportText('');
            await onSaveOutline(sanitizeVertices(ring) as DashZoneVertex[], promoteTemplate);
          })();
        }}
      />

      <ImportParishTownPinsOverlay
        open={showPinImport}
        parishName={parish.name}
        text={pinImportText}
        saving={saving}
        onTextChange={setPinImportText}
        onClose={() => {
          setShowPinImport(false);
          setPinImportText('');
        }}
        onImport={() => {
          const text = pinImportText.trim();
          if (!text) return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            toast.error('Invalid JSON');
            return;
          }
          const pins = pinsFromGeoJson(parsed);
          if (!pins || pins.length === 0) {
            toast.error('Need Point features (FeatureCollection with city/name properties)');
            return;
          }
          setShowPinImport(false);
          setPinImportText('');
          onSaveTownPins(pins);
        }}
      />
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
  const [showJamaicaOverview, setShowJamaicaOverview] = useState(false);
  const [newParishName, setNewParishName] = useState('');
  const [addTownParishId, setAddTownParishId] = useState<string | null>(null);
  const [newTownName, setNewTownName] = useState('');
  const [catalogTowns, setCatalogTowns] = useState<DashAdminBoundary[]>([]);
  const [catalogPcode, setCatalogPcode] = useState('');
  const [showImportBoundaries, setShowImportBoundaries] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [townExpanded, setTownExpanded] = useState<Record<string, boolean>>({});
  const [mapTownId, setMapTownId] = useState<string | null>(null);
  const [mapParishId, setMapParishId] = useState<string | null>(null);
  const [parishEditing, setParishEditing] = useState(false);
  const [recomputeLockedOnPublish, setRecomputeLockedOnPublish] = useState(false);
  const [unlockAfterOnPublish, setUnlockAfterOnPublish] = useState(false);
  const [tipTownId, setTipTownId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<MarketReadiness | null>(null);
  const [versions, setVersions] = useState<CoverageVersionRow[]>([]);
  const [activity, setActivity] = useState<ActivityLogRow[]>([]);
  const [metaEditZone, setMetaEditZone] = useState<{ marketId: string; zone: DashZoneRow } | null>(
    null,
  );

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

  const saveParishTownPins = async (pins: DashParishTownPin[]) => {
    if (!mapParishId || !canWrite) return;
    setSaving(true);
    try {
      const res = await updateParishTownPins(session.access_token, mapParishId, { pins });
      toast.success(`Town pins saved (${res.pin_count}) for ${mapParish?.name ?? 'this parish'}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  };

  const saveParishOutline = async (polygon: DashZoneVertex[], promoteTemplate = true) => {
    if (!mapParishId || !canWrite) return;
    setSaving(true);
    try {
      const res = await updateParishOutline(session.access_token, mapParishId, {
        polygon,
        confirm_foundation_edit: true,
        promote_template: promoteTemplate,
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
      setCatalogPcode('');
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

  const submitTownFromCatalog = async (parishId: string) => {
    if (!canWrite || !catalogPcode) return;
    setSaving(true);
    try {
      const res = await createTownFromBoundary(session.access_token, parishId, catalogPcode);
      toast.success(`Town created from catalog (${res.market.name})`);
      setAddTownParishId(null);
      setCatalogPcode('');
      setNewTownName('');
      setCollapsed((c) => ({ ...c, [parishId]: false }));
      if (res.market?.id) {
        setTipTownId(res.market.id);
        setTownExpanded((t) => ({ ...t, [res.market.id]: true }));
        setMapTownId(res.market.id);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create from catalog failed');
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
          category: 'operational',
          source: payload.source ?? (editor.mode === 'radius' ? 'radius' : 'manual'),
          center_lat: payload.center_lat,
          center_lng: payload.center_lng,
          radius_m: payload.radius_m,
          zone_policy: { action: 'block' },
        });
        toast.success('Non-delivery zone saved — set details, then publish');
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
      description:
        zone.kind === 'exclude'
          ? `Delete “${zone.name}”? Publish afterward if you want this change live for customers.`
          : `Delete “${zone.name}”? This removes the town delivery outline. Publish afterward if customers should stop using the old border.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteZone(session.access_token, marketId, zone.id);
      toast.success(zone.kind === 'exclude' ? 'Non-delivery zone deleted' : 'Town border deleted');
      if (editor && editor.mode === 'adjust' && editor.zone.id === zone.id) setEditor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const removeTown = async (town: DashMarketRow) => {
    if (!canWrite) return;
    const ok = await confirm({
      title: `Delete town “${town.name}”?`,
      description:
        'Removes this town and all its zones. Merchants linked to it will be unassigned. This cannot be undone.',
      confirmLabel: 'Delete town',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteMarket(session.access_token, town.id);
      toast.success(`Deleted ${town.name}`);
      if (mapTownId === town.id) setMapTownId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete town failed');
    }
  };

  const applyOfficialBorder = async (town: DashMarketRow) => {
    if (!canWrite || !town.pcode) return;
    try {
      await promoteMarketBoundary(session.access_token, town.id, town.pcode, town.name);
      toast.success(`Official border applied (${town.pcode})`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Apply official border failed');
    }
  };

  const saveExclusionMeta = async (values: ExclusionFormValues) => {
    if (!metaEditZone || !canWrite) return;
    setSaving(true);
    try {
      await updateZone(session.access_token, metaEditZone.marketId, metaEditZone.zone.id, {
        name: values.name.trim(),
        category: values.category || null,
        reason: values.reason || null,
        is_active: values.is_active,
        effective_from: values.effective_from || null,
        effective_to: values.effective_to || null,
        priority: values.priority,
        zone_policy: { action: values.zone_policy },
      });
      toast.success('Non-delivery zone updated');
      setMetaEditZone(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const townProps = (town: DashMarketRow, parish?: DashParishRow): TownCardProps => ({
    town,
    canWrite,
    expanded: townExpanded[town.id] === true,
    parishPcode: parish?.pcode ?? null,
    accessToken: session.access_token,
    onToggleExpanded: () =>
      setTownExpanded((t) => ({ ...t, [town.id]: !(t[town.id] === true) })),
    onToggleActive: (m) => void toggleActive(m),
    onOpenMap: (opts) => openTownMap(town.id, opts),
    onRemoveZone: (id, z) => void removeZone(id, z),
    onEditExclusionMeta: (id, z) => setMetaEditZone({ marketId: id, zone: z }),
    onDeleteTown: (t) => void removeTown(t),
    onApplyOfficialBorder: (t) => applyOfficialBorder(t),
    onCommunitiesUnioned: () => void load(),
  });

  const renderParishBlock = (p: DashParishRow) => {
    const isCollapsed = collapsed[p.id] !== false;
    const towns = p.towns ?? [];
    const hasParishBorder = parishFoundationVerts(p).length >= 3;
    const parishBoundaryMode = p.coverage_mode === 'parish_boundary';
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
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-white">{p.name}</h3>
              <ProvenanceBadge source={p.boundary_source} validOn={p.boundary_valid_on} />
            </div>
            <p className="text-xs text-slate-500">
              Parish · {hasParishBorder ? 'border set' : 'no border yet'} · {towns.length} town
              {towns.length === 1 ? '' : 's'}
              {parishBoundaryMode ? ' · parish border delivery' : ' · town zones + parish gate'}
              {p.pcode ? ` · ${p.pcode}` : ''}
            </p>
          </div>
          {canWrite && (
            <select
              value={p.coverage_mode ?? 'town_zones'}
              disabled={saving}
              onChange={(e) => {
                void (async () => {
                  const mode = e.target.value as 'town_zones' | 'parish_boundary';
                  if (
                    mode === 'parish_boundary' &&
                    !window.confirm(
                      'Parish border mode uses the parish outline for customer delivery across all towns in this parish. Continue?',
                    )
                  ) {
                    return;
                  }
                  setSaving(true);
                  try {
                    await updateParish(session.access_token, p.id, { coverage_mode: mode });
                    toast.success(
                      mode === 'parish_boundary'
                        ? 'Parish border mode enabled'
                        : 'Town zones mode enabled',
                    );
                    await load();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Update failed');
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
              className="px-2 py-1 text-xs rounded-lg bg-slate-950 border border-slate-700 text-white"
            >
              <option value="town_zones">Town zones</option>
              <option value="parish_boundary">Parish border</option>
            </select>
          )}
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
                  setCatalogPcode('');
                  setCatalogTowns([]);
                  if (p.pcode) {
                    void listAdminBoundaries(session.access_token, {
                      admin_level: 2,
                      parent_pcode: p.pcode,
                    })
                      .then((r) => setCatalogTowns(r.boundaries))
                      .catch(() => setCatalogTowns([]));
                  }
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
              <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                {p.pcode ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs text-slate-400 mb-1">
                        Official town (admin2 · pcode)
                      </label>
                      <select
                        value={catalogPcode}
                        onChange={(e) => setCatalogPcode(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
                      >
                        <option value="">
                          {catalogTowns.length === 0
                            ? 'No catalog towns (import boundaries first)…'
                            : 'Select catalog town…'}
                        </option>
                        {catalogTowns.map((b) => (
                          <option key={b.pcode} value={b.pcode}>
                            {b.name} ({b.pcode})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={saving || !catalogPcode}
                      onClick={() => void submitTownFromCatalog(p.id)}
                      className="px-3 py-2 rounded-lg bg-amber-500 text-slate-950 text-sm font-semibold disabled:opacity-50"
                    >
                      Create from catalog
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddTownParishId(null)}
                      className="px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-200/90">
                      This parish is not linked to an official COD-AB border yet. Free-text towns
                      will not get a catalog pcode — promote a parish boundary first when you can.
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
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
                        className="px-3 py-2 rounded-lg border border-slate-600 text-sm text-slate-200 disabled:opacity-50"
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
                  </div>
                )}
              </div>
            )}

            {towns.length === 0 ? (
              <p className="text-xs text-slate-500">No towns in this parish yet.</p>
            ) : (
              towns.map((t) => (
                <TownCard
                  key={t.id}
                  {...townProps(t, p)}
                  parishBoundaryMode={parishBoundaryMode}
                />
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  const parishesWithTowns = parishes.filter((p) => (p.towns ?? []).length > 0);
  const emptyParishes = parishes.filter((p) => (p.towns ?? []).length === 0);
  const searchQ = listSearch.trim().toLowerCase();
  const matchesSearch = (p: DashParishRow) => {
    if (!searchQ) return true;
    if (p.name.toLowerCase().includes(searchQ) || p.slug.toLowerCase().includes(searchQ)) return true;
    return (p.towns ?? []).some(
      (t) =>
        t.name.toLowerCase().includes(searchQ) ||
        String(t.slug ?? '').toLowerCase().includes(searchQ),
    );
  };
  const filteredWithTowns = parishesWithTowns.filter(matchesSearch);
  const filteredEmpty = emptyParishes.filter(matchesSearch);

  return (
    <div className="space-y-6 text-slate-200">
      <PlatformExclusionsPanel
        accessToken={session.access_token}
        parishes={parishes}
        canWrite={canWrite}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Map className="w-5 h-5 text-emerald-400" />
            Delivery Markets
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Parish border sets the outer limit or whole-parish launch. Town borders apply when a
            parish uses town zones mode.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder="Search parishes / towns…"
            className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white min-w-[180px]"
          />
          <button
            type="button"
            onClick={() => setShowJamaicaOverview(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-sm text-emerald-100"
          >
            <Map className="w-4 h-4" />
            Jamaica overview
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowImportBoundaries(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-sm text-amber-100"
            >
              <Upload className="w-4 h-4" />
              Import boundaries
            </button>
          )}
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
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p className="font-medium text-amber-200">Ops playbook</p>
        <p className="mt-1 text-amber-100/80">
          Open parish map → set parish border → choose coverage mode → Open town map → set town
          border (town zones mode) → add non-delivery zones → Publish coverage → Activate.
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
          {filteredWithTowns.map(renderParishBlock)}

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
              {filteredEmpty.map(renderParishBlock)}
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
          siblingTowns={markets.filter(
            (m) =>
              m.id !== mapTown.id &&
              m.parish_id != null &&
              mapTown.parish_id != null &&
              m.parish_id === mapTown.parish_id,
          )}
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
          recomputeLocked={recomputeLockedOnPublish}
          onRecomputeLockedChange={setRecomputeLockedOnPublish}
          unlockAfter={unlockAfterOnPublish}
          onUnlockAfterChange={setUnlockAfterOnPublish}
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
          onRenameTown={async (nextName) => {
            setSaving(true);
            try {
              await updateMarket(session.access_token, mapTown.id, { name: nextName });
              toast.success(`Town renamed to ${nextName}`);
              await load();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Rename failed');
            } finally {
              setSaving(false);
            }
          }}
          onPublish={() => {
            void (async () => {
              if (hasBlockingCoverageConflicts(conflicts)) {
                toast.error('Fix non-delivery zone conflicts before publishing');
                return;
              }
              setSaving(true);
              try {
                let diffMsg = '';
                try {
                  const preview = await previewMarketCoverageDiff(session.access_token, mapTown.id);
                  diffMsg = preview.message;
                } catch {
                  /* preview optional */
                }
                const ok = await confirm({
                  title: 'Publish coverage?',
                  description: diffMsg
                    ? `${diffMsg}. This updates live delivery zones and recompiles H3 hex cells.`
                    : 'This updates live delivery zones and recompiles H3 hex cells.',
                  confirmLabel: 'Publish',
                });
                if (!ok) return;
                const published = await publishMarketCoverage(session.access_token, mapTown.id, {
                  recompute_locked: recomputeLockedOnPublish,
                  unlock_after: unlockAfterOnPublish,
                });
                const hex = published.hex_compile;
                toast.success(
                  `Coverage published${formatMerchantRecomputeToast(published.merchant_recompute)}${
                    hex ? ` · hex +${hex.include} include / ${hex.exclude} exclude` : ''
                  }`,
                );
                offerParishModeSuggestion(
                  session.access_token,
                  published.parish_mode_suggestion,
                  load,
                );
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
                const restored = await restoreCoverageVersion(
                  session.access_token,
                  mapTown.id,
                  versionId,
                  true,
                  {
                    recomputeLocked: recomputeLockedOnPublish,
                    unlockAfter: unlockAfterOnPublish,
                  },
                );
                toast.success(
                  `Version restored and published${formatMerchantRecomputeToast(restored.merchant_recompute)}`,
                );
                offerParishModeSuggestion(
                  session.access_token,
                  restored.parish_mode_suggestion,
                  load,
                );
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
                  } else if (isLegacyGeoJsonBlocked(parsed)) {
                    toast.error(LEGACY_IMPORT_BLOCKED_MESSAGE);
                    setSaving(false);
                    return;
                  } else {
                    // geojson.io exports FeatureCollection — unwrap to lat/lng ring
                    const ring = polygonFromGeoJson(parsed);
                    if (ring) {
                      payload.polygon = ring;
                    } else {
                      toast.error(
                        'Need a single-ring Polygon. Use Import Boundaries for official multi-part files.',
                      );
                      setSaving(false);
                      return;
                    }
                  }
                } catch {
                  toast.error('Invalid JSON');
                  setSaving(false);
                  return;
                }
                if (!payload.polygon && !payload.geojson) {
                  toast.error('Need a single-ring Polygon');
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

      {showJamaicaOverview && (
        <JamaicaOverviewMap
          parishes={parishes}
          onClose={() => setShowJamaicaOverview(false)}
        />
      )}

      {mapParish && (
        <ParishMapOverlay
          parish={mapParish}
          accessToken={session.access_token}
          canWrite={canWrite}
          saving={saving}
          editing={parishEditing}
          onClose={closeParishMap}
          onSetEditing={setParishEditing}
          onSaveOutline={(polygon, promote) => saveParishOutline(polygon, promote)}
          onSaveTownPins={(pins) => void saveParishTownPins(pins)}
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
          onRequestImportGeoJson={async () => {
            const ok = await confirm({
              title: 'Import parish foundation border?',
              description:
                'This replaces the parish base outline with your GeoJSON file. Town delivery borders are unchanged.',
              confirmLabel: 'Import GeoJSON',
            });
            return ok;
          }}
        />
      )}

      <ImportBoundariesWizard
        open={showImportBoundaries}
        accessToken={session.access_token}
        onClose={() => setShowImportBoundaries(false)}
        onImported={() => void load()}
      />

      <ExclusionDetailSheet
        open={metaEditZone != null}
        title="Non-delivery zone"
        initial={
          metaEditZone ? formFromZone(metaEditZone.zone) : defaultExclusionForm()
        }
        saving={saving}
        onClose={() => setMetaEditZone(null)}
        onSave={saveExclusionMeta}
      />
    </div>
  );
}
