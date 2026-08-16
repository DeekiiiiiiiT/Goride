import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ChevronDown, ChevronRight, Loader2, Map, Plus, Pencil, Trash2, Scissors } from 'lucide-react';
import { toast } from 'sonner';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import {
  checkCoveragePoint,
  createMarket,
  createParish,
  createZone,
  deleteParish,
  deleteZone,
  listMarkets,
  updateMarket,
  updateZone,
  type DashMarketRow,
  type DashParishRow,
  type DashZoneRow,
  type DashZoneVertex,
} from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { ZoneMapEditor, type ZoneMapUiMode } from './ZoneMapEditor';

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

function includeZones(m: DashMarketRow): DashZoneRow[] {
  return (m.zones ?? []).filter((z) => z.kind === 'include' && z.polygon.length >= 3);
}

function primaryDeliveryArea(m: DashMarketRow): DashZoneRow | null {
  const includes = includeZones(m);
  if (includes.length === 0) return null;
  return [...includes].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0] ?? null;
}

type EditorTarget =
  | { mode: 'cutout'; marketId: string }
  | { mode: 'adjust'; marketId: string; zone: DashZoneRow };

type TownCardProps = {
  town: DashMarketRow;
  canWrite: boolean;
  saving: boolean;
  editor: EditorTarget | null;
  accessToken: string;
  highlightTip?: boolean;
  onToggleActive: (m: DashMarketRow) => void;
  onSetEditor: (e: EditorTarget | null) => void;
  onRemoveZone: (marketId: string, zone: DashZoneRow) => void;
  onSaveEditor: (polygon: DashZoneVertex[]) => void;
};

function TownCard({
  town: m,
  canWrite,
  saving,
  editor,
  accessToken,
  highlightTip,
  onToggleActive,
  onSetEditor,
  onRemoveZone,
  onSaveEditor,
}: TownCardProps) {
  const zones = m.zones ?? [];
  const includes = zones.filter((z) => z.kind === 'include');
  const excludes = zones.filter((z) => z.kind === 'exclude');
  const delivery = primaryDeliveryArea(m);
  const editingThis =
    editor &&
    ((editor.mode === 'cutout' && editor.marketId === m.id) ||
      (editor.mode === 'adjust' && editor.marketId === m.id));

  let uiMode: ZoneMapUiMode = 'view';
  let initialPolygon: DashZoneVertex[] = [];
  let editingZoneId: string | null = null;
  if (editingThis && editor) {
    if (editor.mode === 'cutout') {
      uiMode = 'cutout';
      initialPolygon = [];
    } else if (editor.zone.kind === 'exclude') {
      uiMode = 'cutout';
      initialPolygon = editor.zone.polygon;
      editingZoneId = editor.zone.id;
    } else {
      uiMode = 'adjust';
      initialPolygon = editor.zone.polygon;
      editingZoneId = editor.zone.id;
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="font-medium text-white text-sm">{m.name}</h4>
          <p className="text-xs text-slate-500">
            Town · {m.is_active ? 'Active' : 'Inactive'}
            {' · '}
            {includes.length > 0 ? 'Delivery area' : 'No delivery area'}
            {' · '}
            {excludes.length} cutout{excludes.length === 1 ? '' : 's'}
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => onToggleActive(m)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              m.is_active ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
            title={
              includeZones(m).length === 0 && !m.is_active
                ? 'Add a delivery area first'
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

      {highlightTip && (
        <p className="text-xs text-emerald-200/90 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          Green is where you deliver. Cut out places you don’t.
        </p>
      )}

      {excludes.length > 0 && (
        <ul className="space-y-2">
          {excludes.map((z) => (
            <li
              key={z.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm"
            >
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">
                Cutout
              </span>
              <span className="font-medium text-slate-200">{z.name}</span>
              {canWrite && (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSetEditor({ mode: 'adjust', marketId: m.id, zone: z })}
                    className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
                    title="Edit cutout on map"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveZone(m.id, z)}
                    className="p-1.5 rounded hover:bg-slate-800 text-red-400"
                    title="Delete cutout"
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
                toast.error('Delivery area missing — reload the page to restore it');
                return;
              }
              onSetEditor({ mode: 'cutout', marketId: m.id });
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/40 text-xs text-red-300"
          >
            <Scissors className="w-3.5 h-3.5" />
            Don’t deliver here
          </button>
          <button
            type="button"
            onClick={() => {
              if (!delivery) {
                toast.error('Delivery area missing — reload the page to restore it');
                return;
              }
              onSetEditor({ mode: 'adjust', marketId: m.id, zone: delivery });
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/40 text-xs text-emerald-300"
          >
            <Pencil className="w-3.5 h-3.5" />
            Adjust delivery area
          </button>
        </div>
      )}

      <ZoneMapEditor
        key={`${m.id}-${uiMode}-${editingZoneId ?? 'view'}`}
        zones={zones.map((z) => ({
          id: z.id,
          kind: z.kind,
          polygon: z.polygon,
          name: z.name,
        }))}
        uiMode={uiMode}
        initialPolygon={initialPolygon}
        editingZoneId={editingZoneId}
        saving={saving}
        onCancel={() => onSetEditor(null)}
        onSave={onSaveEditor}
        onTestPoint={(lat, lng) => checkCoveragePoint(accessToken, lat, lng)}
      />
    </div>
  );
}

export function MarketsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);

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
  const [tipTownId, setTipTownId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listMarkets(session.access_token);
      const towns = (res.markets ?? []).map(normalizeTown);
      setMarkets(towns);
      setParishes(
        (res.parishes ?? []).map((p) => ({
          ...p,
          towns: (p.towns ?? []).map(normalizeTown),
        })),
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

  const toggleActive = async (m: DashMarketRow) => {
    if (!canWrite) return;
    const next = !m.is_active;
    if (next && includeZones(m).length === 0) {
      toast.error('Add a delivery area before activating this town');
      return;
    }
    try {
      await updateMarket(session.access_token, m.id, { is_active: next });
      toast.success(`${m.name} ${next ? 'activated' : 'paused'}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
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
      toast.success('Town created with delivery area');
      setAddTownParishId(null);
      setNewTownName('');
      if (parishId) setCollapsed((c) => ({ ...c, [parishId]: false }));
      const createdId = res.market?.id;
      if (createdId) setTipTownId(createdId);
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

  const saveEditor = async (polygon: DashZoneVertex[]) => {
    if (!editor || !canWrite) return;
    setSaving(true);
    try {
      if (editor.mode === 'cutout') {
        const town = findTown(editor.marketId);
        const name = `No delivery ${(town?.zones?.filter((z) => z.kind === 'exclude').length ?? 0) + 1}`;
        await createZone(session.access_token, editor.marketId, {
          name,
          polygon,
          kind: 'exclude',
          priority: 10,
        });
        toast.success('Cutout saved');
      } else {
        await updateZone(session.access_token, editor.marketId, editor.zone.id, {
          polygon,
          kind: editor.zone.kind,
        });
        toast.success(editor.zone.kind === 'exclude' ? 'Cutout updated' : 'Delivery area updated');
      }
      setEditor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const removeZone = async (marketId: string, zone: DashZoneRow) => {
    if (!canWrite) return;
    const label = zone.kind === 'exclude' ? 'cutout' : 'delivery area';
    if (!window.confirm(`Delete ${label} “${zone.name}”?`)) return;
    try {
      await deleteZone(session.access_token, marketId, zone.id);
      toast.success(zone.kind === 'exclude' ? 'Cutout deleted' : 'Delivery area reset');
      if (editor && editor.mode === 'adjust' && editor.zone.id === zone.id) setEditor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const townProps = (town: DashMarketRow): TownCardProps => ({
    town,
    canWrite,
    saving,
    editor,
    accessToken: session.access_token,
    highlightTip: tipTownId === town.id,
    onToggleActive: (m) => void toggleActive(m),
    onSetEditor: setEditor,
    onRemoveZone: (id, z) => void removeZone(id, z),
    onSaveEditor: (poly) => void saveEditor(poly),
  });

  const renderParishBlock = (p: DashParishRow) => {
    const isCollapsed = collapsed[p.id] === true;
    const towns = p.towns ?? [];
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
              Parish · {towns.length} town{towns.length === 1 ? '' : 's'}
            </p>
          </div>
          {canWrite && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
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
            Parish → town. Each town gets a delivery border automatically — cut out places you don’t
            serve, then activate when ready.
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
        <p className="font-medium text-amber-200">Launch tip</p>
        <p className="mt-1 text-amber-100/80">
          Keep Spanish Town (St. Catherine) inactive until couriers and merchants are ready. Add
          towns under a parish — the green border is coverage. Cut out areas you don’t serve before
          activating.
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
    </div>
  );
}
