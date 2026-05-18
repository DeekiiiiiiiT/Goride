import React, { useEffect, useMemo, useState } from 'react';
import { VEHICLE_BODY_TYPE_OPTIONS } from '@roam/business-config';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import {
  createVehicleType,
  deleteVehicleType,
  listCommandoBodyTypes,
  updateVehicleType,
} from '../services/ridesAdminService';
import { useVehicleTypesContext } from '../context/VehicleTypesContext';
import {
  normalizeTransportSolutionSlug,
  validateTransportSolutionSlug,
  vehicleCapacityDisplay,
  type RidesVehicleTypeDto,
  type RidesVehicleTypeInput,
  type TransportSolutionKind,
} from '@/types/vehicleTypes';

type OutletContext = { session: Session };

function emptyForm(kind: TransportSolutionKind): RidesVehicleTypeInput & { slug: string } {
  return {
    slug: '',
    label: '',
    description: '',
    seats: kind === 'service' ? 0 : 4,
    capacity_label: kind === 'service' ? 'Variable' : '',
    tagline: '',
    sort_order: 50,
    is_active: true,
    solution_kind: kind,
  };
}

function TypeCard({
  row,
  onEdit,
  onDelete,
}: {
  row: RidesVehicleTypeDto;
  onEdit: (row: RidesVehicleTypeDto) => void;
  onDelete: (row: RidesVehicleTypeDto) => void;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        row.is_active
          ? 'border-slate-700 bg-slate-800/40'
          : 'border-slate-800 bg-slate-900/50 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-white">{row.label}</span>
            <span className="text-[11px] text-slate-500 shrink-0">
              {vehicleCapacityDisplay(row)}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{row.slug}</p>
          <p className="text-xs text-slate-400 mt-1">{row.description}</p>
          {row.tagline && <p className="text-[11px] text-slate-500 mt-1">{row.tagline}</p>}
          {!row.is_active && (
            <span className="inline-block mt-2 text-[10px] uppercase tracking-wide text-amber-400/90">
              Inactive
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onEdit(row)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(row)}
            className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  items,
  addLabel,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  description: string;
  items: RidesVehicleTypeDto[];
  addLabel: string;
  onAdd: () => void;
  onEdit: (row: RidesVehicleTypeDto) => void;
  onDelete: (row: RidesVehicleTypeDto) => void;
}) {
  return (
    <section className="space-y-3 max-w-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <p className="text-sm text-slate-400 mt-0.5">{description}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2"
        >
          <Plus className="w-4 h-4" />
          {addLabel}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">None yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((row) => (
            <TypeCard key={row.slug} row={row} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}

const KIND_META: Record<
  TransportSolutionKind,
  { title: string; description: string; addLabel: string }
> = {
  vehicle: {
    title: 'Vehicle types',
    description:
      'Passenger ride tiers linked to body types in Commando (motor vehicle database).',
    addLabel: 'Add vehicle type',
  },
  service: {
    title: 'Services',
    description: 'Non-passenger offerings such as package delivery.',
    addLabel: 'Add service',
  },
};

type VehicleTypesManagerProps = {
  kind: TransportSolutionKind;
};

export function VehicleTypesManager({ kind }: VehicleTypesManagerProps) {
  const { session } = useOutletContext<OutletContext>();
  const { allVehicles, allServices, loading, reload } = useVehicleTypesContext();
  const items = kind === 'vehicle' ? allVehicles : allServices;
  const meta = KIND_META[kind];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RidesVehicleTypeDto | null>(null);
  const [form, setForm] = useState(() => emptyForm(kind));
  const [saving, setSaving] = useState(false);
  const [commandoBodyTypes, setCommandoBodyTypes] = useState<string[]>([]);
  const [commandoLoading, setCommandoLoading] = useState(false);
  const [selectedCommandoBody, setSelectedCommandoBody] = useState('');

  const usedVehicleSlugs = useMemo(() => new Set(items.map((row) => row.slug)), [items]);

  const availableCommandoBodies = useMemo(() => {
    return commandoBodyTypes.filter((body) => {
      const slug = normalizeTransportSolutionSlug(body);
      return slug.length > 0 && !usedVehicleSlugs.has(slug);
    });
  }, [commandoBodyTypes, usedVehicleSlugs]);

  useEffect(() => {
    if (!dialogOpen || editing || kind !== 'vehicle') return;

    let cancelled = false;
    setCommandoLoading(true);
    void listCommandoBodyTypes(session.access_token)
      .then((res) => {
        if (!cancelled) setCommandoBodyTypes(res.body_types);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setCommandoBodyTypes([...VEHICLE_BODY_TYPE_OPTIONS]);
          toast.error(
            e instanceof Error
              ? e.message
              : 'Could not load Commando body types; using default list.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCommandoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dialogOpen, editing, kind, session.access_token]);

  const openCreate = () => {
    setEditing(null);
    setSelectedCommandoBody('');
    setForm({ ...emptyForm(kind), sort_order: (items.length + 1) * 10 });
    setDialogOpen(true);
  };

  const pickCommandoBodyType = (bodyType: string) => {
    setSelectedCommandoBody(bodyType);
    const slug = normalizeTransportSolutionSlug(bodyType);
    setForm((f) => ({
      ...f,
      slug,
      label: bodyType,
    }));
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
      solution_kind: row.solution_kind,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (row: RidesVehicleTypeDto) => {
    const kindLabel = row.solution_kind === 'service' ? 'service' : 'vehicle type';
    if (!window.confirm(`Delete ${kindLabel} "${row.label}" (${row.slug})? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteVehicleType(session.access_token, row.slug);
      toast.success('Deleted');
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
      solution_kind: form.solution_kind,
    };
    try {
      if (editing) {
        await updateVehicleType(session.access_token, editing.slug, payload);
        toast.success('Updated');
      } else {
        if (kind === 'vehicle' && !selectedCommandoBody) {
          toast.error('Select a body type from Commando.');
          return;
        }
        const slug = normalizeTransportSolutionSlug(form.slug);
        const slugError = validateTransportSolutionSlug(slug);
        if (slugError) {
          toast.error(slugError);
          return;
        }
        await createVehicleType(session.access_token, { ...payload, slug });
        toast.success('Created');
      }
      setDialogOpen(false);
      await reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const kindLabel = form.solution_kind === 'service' ? 'service' : 'vehicle type';

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-slate-400 flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </p>
      ) : (
        <Section
          title={meta.title}
          description={meta.description}
          items={items}
          addLabel={meta.addLabel}
          onAdd={openCreate}
          onEdit={openEdit}
          onDelete={(row) => void handleDelete(row)}
        />
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
                {editing ? `Edit ${kindLabel}` : `New ${kindLabel}`}
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
              {!editing && form.solution_kind === 'vehicle' && (
                <>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Commando body type</p>
                  <label className="block">
                    <span className="text-sm text-slate-300">Body type (motor vehicle database)</span>
                    {commandoLoading ? (
                      <p className="mt-2 text-sm text-slate-400 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading from Commando…
                      </p>
                    ) : (
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
                        value={selectedCommandoBody}
                        onChange={(e) => pickCommandoBodyType(e.target.value)}
                      >
                        <option value="">Select a body type…</option>
                        {availableCommandoBodies.map((body) => (
                          <option key={body} value={body}>
                            {body}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Options come from Commando (roamdominion.co) motor vehicle catalog body types.
                      Already-added types are hidden.
                    </p>
                    {form.slug ? (
                      <p className="mt-2 text-xs text-slate-400">
                        Ride ID: <span className="font-mono text-slate-300">{form.slug}</span>
                      </p>
                    ) : null}
                  </label>
                </>
              )}
              {!editing && form.solution_kind === 'service' && (
                <>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Service</p>
                  <label className="block">
                    <span className="text-sm text-slate-300">ID (slug)</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white font-mono"
                      value={form.slug}
                      placeholder="e.g. roam-standard"
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          slug: normalizeTransportSolutionSlug(e.target.value),
                        }))
                      }
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Lowercase letters, numbers, hyphens. Spaces become hyphens.
                    </p>
                  </label>
                </>
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
