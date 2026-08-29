import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { DashZoneRow, DashZoneVertex, ZoneCategory, ZonePolicyAction } from '@roam/dash-admin-client';

export const ZONE_CATEGORIES: { value: ZoneCategory; label: string }[] = [
  { value: 'safety', label: 'Safety' },
  { value: 'access', label: 'Access' },
  { value: 'legal', label: 'Legal' },
  { value: 'operational', label: 'Operational' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'geographic', label: 'Geographic' },
];

export const ZONE_POLICY_OPTIONS: { value: ZonePolicyAction; label: string }[] = [
  { value: 'block', label: 'Block delivery' },
  { value: 'surcharge', label: 'Deliver with surcharge' },
  { value: 'courier_opt_in', label: 'Courier opt-in only' },
  { value: 'manager_approval', label: 'Manager approval' },
  { value: 'cash_disabled', label: 'No cash on delivery' },
];

export type ExclusionFormValues = {
  name: string;
  category: ZoneCategory | '';
  reason: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string;
  priority: number;
  zone_policy: ZonePolicyAction;
};

export function defaultExclusionForm(name = ''): ExclusionFormValues {
  return {
    name,
    category: '',
    reason: '',
    is_active: true,
    effective_from: '',
    effective_to: '',
    priority: 100,
    zone_policy: 'block',
  };
}

export function formFromZone(zone: DashZoneRow): ExclusionFormValues {
  const policy = zone.zone_policy?.action ?? 'block';
  return {
    name: zone.name,
    category: (zone.category as ZoneCategory) ?? '',
    reason: zone.reason ?? '',
    is_active: zone.is_active !== false,
    effective_from: zone.effective_from?.slice(0, 16) ?? '',
    effective_to: zone.effective_to?.slice(0, 16) ?? '',
    priority: zone.priority ?? 100,
    zone_policy: policy as ZonePolicyAction,
  };
}

type Props = {
  open: boolean;
  title: string;
  initial: ExclusionFormValues;
  saving?: boolean;
  onClose: () => void;
  onSave: (values: ExclusionFormValues) => void | Promise<void>;
};

export function ExclusionDetailSheet({ open, title, initial, saving, onClose, onSave }: Props) {
  const [form, setForm] = useState(initial);

  React.useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/50">
      <div className="flex h-full w-full max-w-md flex-col bg-zinc-950 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block space-y-1">
            <span className="text-xs text-zinc-400">Name</span>
            <input
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-zinc-400">Category (required to publish)</span>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ZoneCategory | '' }))}
            >
              <option value="">Select…</option>
              {ZONE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-zinc-400">Reason (optional)</span>
            <textarea
              className="min-h-[72px] w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-zinc-400">Effective from</span>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs text-zinc-100"
                value={form.effective_from}
                onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-400">Effective to</span>
              <input
                type="datetime-local"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs text-zinc-100"
                value={form.effective_to}
                onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-zinc-400">Priority (excludes default 100; safe-island includes must be higher, e.g. 200)</span>
            <input
              type="number"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-zinc-400">Delivery policy</span>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              value={form.zone_policy}
              onChange={(e) => setForm((f) => ({ ...f, zone_policy: e.target.value as ZonePolicyAction }))}
            >
              {ZONE_POLICY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2 border-t border-zinc-800 p-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !form.name.trim()}
            onClick={() => void onSave(form)}
            className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function exclusionStatusLabel(zone: DashZoneRow): string | null {
  if (zone.kind !== 'exclude') return null;
  if (zone.is_active === false) return 'Disabled';
  const now = Date.now();
  if (zone.effective_from && Date.parse(zone.effective_from) > now) return 'Scheduled';
  if (zone.effective_to && Date.parse(zone.effective_to) <= now) return 'Expired';
  return 'Active';
}

export type ScopedExclusionDraft = {
  scope: 'global' | 'parish' | 'market';
  parish_id?: string;
  market_id?: string;
  name: string;
  polygon: DashZoneVertex[];
  form: ExclusionFormValues;
};
