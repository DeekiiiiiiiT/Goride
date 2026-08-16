import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2, Map, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import {
  checkCoveragePoint,
  createMarket,
  createZone,
  deleteZone,
  listMarkets,
  updateMarket,
  updateZone,
  type DashMarketRow,
  type DashZoneKind,
  type DashZoneRow,
  type DashZoneVertex,
} from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { ZoneMapEditor } from './ZoneMapEditor';

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

function includeZones(m: DashMarketRow): DashZoneRow[] {
  return (m.zones ?? []).map(normalizeZone).filter((z) => z.kind === 'include' && z.polygon.length >= 3);
}

type EditorTarget =
  | { mode: 'create'; marketId: string; kind: DashZoneKind }
  | { mode: 'edit'; marketId: string; zone: DashZoneRow };

export function MarketsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);

  const [markets, setMarkets] = useState<DashMarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [priorityDraft, setPriorityDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await listMarkets(session.access_token);
      setMarkets(
        (res.markets ?? []).map((m) => ({
          ...m,
          zones: (m.zones ?? []).map(normalizeZone),
        })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load markets');
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (m: DashMarketRow) => {
    if (!canWrite) return;
    const next = !m.is_active;
    if (next && includeZones(m).length === 0) {
      toast.error('Add at least one include zone before activating this market');
      return;
    }
    try {
      await updateMarket(session.access_token, m.id, { is_active: next });
      setMarkets((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_active: next } : x)));
      toast.success(`${m.name} ${next ? 'activated' : 'paused'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const submitCreate = async () => {
    if (!canWrite || !newName.trim()) return;
    setSaving(true);
    try {
      await createMarket(session.access_token, { name: newName.trim(), is_active: false });
      toast.success('Market created');
      setShowCreate(false);
      setNewName('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const saveEditor = async (polygon: DashZoneVertex[]) => {
    if (!editor || !canWrite) return;
    setSaving(true);
    try {
      if (editor.mode === 'create') {
        const name =
          editor.kind === 'exclude'
            ? `Exclude ${(markets.find((m) => m.id === editor.marketId)?.zones?.length ?? 0) + 1}`
            : `Zone ${(markets.find((m) => m.id === editor.marketId)?.zones?.length ?? 0) + 1}`;
        await createZone(session.access_token, editor.marketId, {
          name,
          polygon,
          kind: editor.kind,
          priority: 10,
        });
        toast.success('Zone created');
      } else {
        await updateZone(session.access_token, editor.marketId, editor.zone.id, {
          polygon,
          kind: editor.zone.kind,
        });
        toast.success('Zone saved');
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
    if (!window.confirm(`Delete zone “${zone.name}”?`)) return;
    try {
      await deleteZone(session.access_token, marketId, zone.id);
      toast.success('Zone deleted');
      if (editor && editor.mode === 'edit' && editor.zone.id === zone.id) setEditor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const commitRename = async (marketId: string, zone: DashZoneRow) => {
    if (!canWrite || !renameValue.trim()) {
      setRenameId(null);
      return;
    }
    try {
      await updateZone(session.access_token, marketId, zone.id, { name: renameValue.trim() });
      toast.success('Zone renamed');
      setRenameId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rename failed');
    }
  };

  const commitPriority = async (marketId: string, zone: DashZoneRow) => {
    if (!canWrite) return;
    const raw = priorityDraft[zone.id] ?? String(zone.priority);
    const priority = Math.trunc(Number(raw));
    if (!Number.isFinite(priority)) {
      toast.error('Priority must be a number');
      return;
    }
    try {
      await updateZone(session.access_token, marketId, zone.id, { priority });
      toast.success('Priority updated');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const editingMarketId =
    editor?.mode === 'create' ? editor.marketId : editor?.mode === 'edit' ? editor.marketId : null;

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Map className="w-5 h-5 text-emerald-400" />
            Delivery Markets
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Draw coverage on the map. Include zones serve customers; exclude zones carve out areas.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            New market
          </button>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p className="font-medium text-amber-200">Spanish Town</p>
        <p className="mt-1 text-amber-100/80">
          Spanish Town is queued as the next market after Kingston. Keep it inactive until courier
          coverage and merchant onboarding are confirmed, then draw its zones on the map and activate
          here. Use exclude zones to skip pockets you do not want to serve.
        </p>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-400 mb-1">Market name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Spanish Town"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
            />
          </div>
          <button
            type="button"
            disabled={saving || !newName.trim()}
            onClick={() => void submitCreate()}
            className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 text-sm font-semibold disabled:opacity-50"
          >
            Create
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : markets.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-12 text-center text-slate-500 text-sm">
          No markets configured yet.
        </div>
      ) : (
        <div className="space-y-4">
          {markets.map((m) => {
            const zones = (m.zones ?? []).map(normalizeZone);
            const includes = zones.filter((z) => z.kind === 'include');
            const excludes = zones.filter((z) => z.kind === 'exclude');
            return (
              <div key={m.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-white">{m.name}</h3>
                    <p className="text-xs text-slate-500">
                      {m.is_active ? 'Active' : 'Inactive'}
                      {' · '}
                      {includes.length} include · {excludes.length} exclude
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => void toggleActive(m)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          m.is_active ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                        title={
                          includeZones(m).length === 0 && !m.is_active
                            ? 'Add an include zone first'
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
                </div>

                {zones.length === 0 ? (
                  <p className="text-xs text-slate-500">No zones yet — draw an include area on the map.</p>
                ) : (
                  <ul className="space-y-2">
                    {zones.map((z) => (
                      <li
                        key={z.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm"
                      >
                        <span
                          className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            z.kind === 'exclude'
                              ? 'bg-red-500/15 text-red-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {z.kind}
                        </span>
                        {renameId === z.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => void commitRename(m.id, z)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void commitRename(m.id, z);
                              if (e.key === 'Escape') setRenameId(null);
                            }}
                            className="flex-1 min-w-[120px] px-2 py-1 rounded bg-slate-900 border border-slate-700 text-sm text-white"
                          />
                        ) : (
                          <button
                            type="button"
                            className="font-medium text-slate-200 hover:text-white"
                            onClick={() => {
                              if (!canWrite) return;
                              setRenameId(z.id);
                              setRenameValue(z.name);
                            }}
                          >
                            {z.name}
                          </button>
                        )}
                        <span className="text-xs text-slate-500">{z.polygon.length} pts</span>
                        <label className="text-xs text-slate-500 flex items-center gap-1">
                          pri
                          <input
                            type="number"
                            className="w-14 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                            value={priorityDraft[z.id] ?? String(z.priority)}
                            onChange={(e) =>
                              setPriorityDraft((prev) => ({ ...prev, [z.id]: e.target.value }))
                            }
                            onBlur={() => void commitPriority(m.id, z)}
                            disabled={!canWrite}
                          />
                        </label>
                        {canWrite && (
                          <div className="ml-auto flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditor({ mode: 'edit', marketId: m.id, zone: z })}
                              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
                              title="Edit on map"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeZone(m.id, z)}
                              className="p-1.5 rounded hover:bg-slate-800 text-red-400"
                              title="Delete zone"
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
                      onClick={() => setEditor({ mode: 'create', marketId: m.id, kind: 'include' })}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/40 text-xs text-emerald-300"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add include zone
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (includes.length === 0) {
                          toast.error('Add an include zone before creating excludes');
                          return;
                        }
                        setEditor({ mode: 'create', marketId: m.id, kind: 'exclude' });
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/40 text-xs text-red-300"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add exclude zone
                    </button>
                  </div>
                )}

                {editingMarketId === m.id && editor && (
                  <ZoneMapEditor
                    key={editor.mode === 'edit' ? editor.zone.id : `new-${editor.kind}`}
                    initialPolygon={editor.mode === 'edit' ? editor.zone.polygon : []}
                    kind={editor.mode === 'edit' ? editor.zone.kind : editor.kind}
                    onKindChange={(kind) => {
                      setEditor((prev) => {
                        if (!prev) return prev;
                        if (prev.mode === 'create') return { ...prev, kind };
                        return { ...prev, zone: { ...prev.zone, kind } };
                      });
                    }}
                    saving={saving}
                    onCancel={() => setEditor(null)}
                    onSave={saveEditor}
                    onTestPoint={(lat, lng) => checkCoveragePoint(session.access_token, lat, lng)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
