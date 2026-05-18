import React, { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import {
  createVehicleType,
  deleteVehicleType,
  updateVehicleType,
} from '../services/ridesAdminService';
import { useVehicleTypesContext } from '../context/VehicleTypesContext';
import {
  vehicleCapacityDisplay,
  type RidesVehicleTypeDto,
  type RidesVehicleTypeInput,
} from '@/types/vehicleTypes';

type OutletContext = { session: Session };

const EMPTY: RidesVehicleTypeInput & { slug: string } = {
  slug: '',
  label: '',
  description: '',
  seats: 4,
  capacity_label: '',
  tagline: '',
  sort_order: 50,
  is_active: true,
};

export function VehicleTypesManager() {
  const { session } = useOutletContext<OutletContext>();
  const { types, loading, reload } = useVehicleTypesContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RidesVehicleTypeDto | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, sort_order: (types.length + 1) * 10 });
    setDialogOpen(true);
  };

  const openEdit = (row: RidesVehicleTypeDto) => {
    setEditing(row);
    setForm({
      slug: row.slug,
      label: row.label,
      description: row.description,
      seats: row.seats,
      capacity_label: row.capacity_label ?? '',
      tagline: row.tagline ?? '',
      sort_order: row.sort_order,
      is_active: row.is_active,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (row: RidesVehicleTypeDto) => {
    if (
      !window.confirm(
        `Delete vehicle type "${row.label}" (${row.slug})? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteVehicleType(session.access_token, row.slug);
      toast.success('Vehicle type deleted');
      await reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const save = async () => {
    setSaving(true);
    const payload: RidesVehicleTypeInput = {
      label: form.label.trim(),
      description: form.description.trim(),
      seats: form.seats,
      capacity_label: form.capacity_label?.trim() || null,
      tagline: form.tagline?.trim() || null,
      sort_order: form.sort_order ?? 0,
      is_active: form.is_active !== false,
    };
    try {
      if (editing) {
        await updateVehicleType(session.access_token, editing.slug, payload);
        toast.success('Vehicle type updated');
      } else {
        const slug = form.slug.trim().toLowerCase();
        if (!slug) {
          toast.error('ID is required');
          return;
        }
        await createVehicleType(session.access_token, { ...payload, slug });
        toast.success('Vehicle type created');
      }
      setDialogOpen(false);
      await reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Vehicle & service types</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Names and descriptions shown when riders book and when you create fare rules. The ID
            (slug) is fixed after creation.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2"
        >
          <Plus className="w-4 h-4" />
          Add type
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400 flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </p>
      ) : (
        <div className="space-y-2 max-w-xl">
          {types.map((v) => (
            <div
              key={v.slug}
              className={`rounded-lg border px-4 py-3 ${
                v.is_active
                  ? 'border-slate-700 bg-slate-800/40'
                  : 'border-slate-800 bg-slate-900/50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-white">{v.label}</span>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {vehicleCapacityDisplay(v)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{v.slug}</p>
                  <p className="text-xs text-slate-400 mt-1">{v.description}</p>
                  {v.tagline && (
                    <p className="text-[11px] text-slate-500 mt-1">{v.tagline}</p>
                  )}
                  {!v.is_active && (
                    <span className="inline-block mt-2 text-[10px] uppercase tracking-wide text-amber-400/90">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(v)}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(v)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-xl max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="font-semibold text-white">
                {editing ? 'Edit vehicle type' : 'New vehicle type'}
              </h3>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {!editing && (
                <label className="block">
                  <span className="text-sm text-slate-300">ID (slug)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
                    value={form.slug}
                    placeholder="e.g. courier"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))
                    }
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Lowercase letters, numbers, underscore. Cannot be changed later.
                  </p>
                </label>
              )}
              {editing && (
                <p className="text-sm text-slate-400">
                  ID: <span className="font-mono text-slate-300">{editing.slug}</span>
                </p>
              )}
              <label className="block">
                <span className="text-sm text-slate-300">Display name</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Description</span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white min-h-[72px]"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-slate-300">Seats</span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
                    value={form.seats}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, seats: parseInt(e.target.value, 10) || 0 }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-300">Capacity label</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
                    value={form.capacity_label ?? ''}
                    placeholder="e.g. Variable"
                    onChange={(e) => setForm((f) => ({ ...f, capacity_label: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-sm text-slate-300">Tagline (optional)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
                  value={form.tagline ?? ''}
                  placeholder="e.g. Send a package"
                  onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-300">Sort order</span>
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
                  value={form.sort_order ?? 0}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.is_active !== false}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-slate-600"
                />
                Active (shown to riders)
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
