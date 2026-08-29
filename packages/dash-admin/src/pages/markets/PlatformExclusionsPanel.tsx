import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createScopedExclusion,
  deleteScopedExclusion,
  listScopedExclusions,
  updateScopedExclusion,
  type DashParishRow,
  type ScopedExclusionRow,
} from '@roam/dash-admin-client';
import {
  ExclusionDetailSheet,
  defaultExclusionForm,
  formFromZone,
  type ExclusionFormValues,
} from './ExclusionDetailSheet';

type Props = {
  accessToken: string;
  parishes: DashParishRow[];
  canWrite: boolean;
};

export function PlatformExclusionsPanel({ accessToken, parishes, canWrite }: Props) {
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<ScopedExclusionRow[]>([]);
  const [tab, setTab] = useState<'global' | 'parish'>('global');
  const [editZone, setEditZone] = useState<ScopedExclusionRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listScopedExclusions(accessToken);
      setZones(res.zones);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!/schema cache|does not exist|PGRST205/i.test(msg)) {
        toast.error(msg || 'Failed to load platform exclusions');
      }
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = zones.filter((z) => z.scope === tab || (tab === 'parish' && z.scope === 'parish'));

  const saveMeta = async (values: ExclusionFormValues) => {
    if (!editZone || !canWrite) return;
    setSaving(true);
    try {
      await updateScopedExclusion(accessToken, editZone.id, {
        name: values.name.trim(),
        category: values.category || null,
        reason: values.reason || null,
        is_active: values.is_active,
        effective_from: values.effective_from || null,
        effective_to: values.effective_to || null,
        priority: values.priority,
        zone_policy: { action: values.zone_policy },
      });
      toast.success('Platform exclusion updated');
      setEditZone(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (zone: ScopedExclusionRow) => {
    if (!canWrite || !window.confirm(`Delete “${zone.name}”?`)) return;
    try {
      await deleteScopedExclusion(accessToken, zone.id);
      toast.success('Deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const createPlaceholder = async () => {
    if (!canWrite) return;
    const parish = parishes[0];
    if (tab === 'parish' && !parish) {
      toast.error('Add a parish first');
      return;
    }
    setSaving(true);
    try {
      const box = parish?.foundation_polygon?.length
        ? parish.foundation_polygon.slice(0, 4)
        : [
            { lat: 18.0, lng: -77.0 },
            { lat: 18.0, lng: -76.99 },
            { lat: 17.99, lng: -76.99 },
            { lat: 17.99, lng: -77.0 },
          ];
      const res = await createScopedExclusion(accessToken, {
        scope: tab,
        parish_id: tab === 'parish' ? parish!.id : undefined,
        name: tab === 'global' ? 'Platform exclusion' : `${parish!.name} exclusion`,
        polygon: box,
        category: 'operational',
        priority: 10,
        zone_policy: { action: 'block' },
      });
      toast.success('Draft created — edit polygon in a future map pass; set metadata now');
      setEditZone(res.zone);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Platform exclusions</h2>
          <p className="text-xs text-zinc-500">One polygon for global or whole-parish no-delivery areas</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('global')}
            className={`rounded-md px-3 py-1 text-xs ${tab === 'global' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
          >
            Global
          </button>
          <button
            type="button"
            onClick={() => setTab('parish')}
            className={`rounded-md px-3 py-1 text-xs ${tab === 'parish' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}
          >
            Parish
          </button>
          {canWrite && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void createPlaceholder()}
              className="inline-flex items-center gap-1 rounded-md bg-rose-700/80 px-3 py-1 text-xs text-white"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-zinc-500">No {tab} exclusions yet.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((z) => (
            <li key={z.id} className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2">
              <div>
                <p className="text-sm text-zinc-200">{z.name}</p>
                <p className="text-[10px] text-zinc-500">
                  {z.scope} · priority {z.priority ?? 10}
                  {z.category ? ` · ${z.category}` : ' · no category'}
                </p>
              </div>
              {canWrite && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="rounded p-1 text-zinc-400 hover:text-zinc-100"
                    onClick={() => setEditZone(z)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-rose-400 hover:text-rose-300"
                    onClick={() => void remove(z)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ExclusionDetailSheet
        open={editZone != null}
        title="Platform exclusion"
        initial={editZone ? formFromZone(editZone as unknown as import('@roam/dash-admin-client').DashZoneRow) : defaultExclusionForm()}
        saving={saving}
        onClose={() => setEditZone(null)}
        onSave={saveMeta}
      />
    </section>
  );
}
