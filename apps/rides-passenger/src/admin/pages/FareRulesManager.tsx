import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FareRuleAdminDto, FareRuleAdminInput } from '../services/ridesAdminService';
import {
  createFareRule,
  listFareRules,
  updateFareRule,
  formatMoneyMinor,
} from '../services/ridesAdminService';

const EMPTY_FORM: FareRuleAdminInput = {
  city: 'jamaica',
  vehicle_type: 'standard',
  currency: 'JMD',
  is_active: true,
  base_fare: 300,
  price_per_km: 120,
  price_per_min: 50,
  booking_fee: 50,
  min_fare: 500,
};

interface FareRulesManagerProps {
  accessToken: string | undefined;
}

export function FareRulesManager({ accessToken }: FareRulesManagerProps) {
  const [rules, setRules] = useState<FareRuleAdminDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FareRuleAdminDto | null>(null);
  const [form, setForm] = useState<FareRuleAdminInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const { rules: rows } = await listFareRules(accessToken);
      setRules(rows);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load fare rules');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (rule: FareRuleAdminDto) => {
    setEditing(rule);
    setForm({
      city: rule.city,
      vehicle_type: rule.vehicle_type,
      currency: rule.currency,
      is_active: rule.is_active,
      base_fare: rule.base_fare,
      price_per_km: rule.price_per_km,
      price_per_min: rule.price_per_min,
      booking_fee: rule.booking_fee,
      min_fare: rule.min_fare,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!accessToken) return;
    setSaving(true);
    try {
      if (editing) {
        await updateFareRule(accessToken, editing.id, form);
        toast.success('Fare rule updated');
      } else {
        await createFareRule(accessToken, form);
        toast.success('Fare rule created');
      }
      setDialogOpen(false);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      toast.error(
        msg.includes('duplicate')
          ? 'An active rule already exists for this city and vehicle'
          : msg
      );
    } finally {
      setSaving(false);
    }
  };

  const fmt = (minor: number, currency: string) => formatMoneyMinor(minor, currency);

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Fare Rules</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Control upfront pricing for Roam Rides. Amounts are in major units (e.g. JMD dollars).
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          <Plus className="w-4 h-4" />
          Add rule
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">
                  City
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">
                  Vehicle
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden sm:table-cell">
                  Base
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden sm:table-cell">
                  Per km
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden md:table-cell">
                  Per min
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden lg:table-cell">
                  Booking
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden lg:table-cell">
                  Min fare
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">
                  Active
                </th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-slate-500 py-12">
                    No fare rules yet. Add Jamaica / standard to get started.
                  </td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-medium text-white">{r.city}</td>
                    <td className="px-4 py-3 text-slate-300">{r.vehicle_type}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-300 hidden sm:table-cell">
                      {fmt(r.base_fare_minor, r.currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-300 hidden sm:table-cell">
                      {fmt(r.price_per_km_minor, r.currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-300 hidden md:table-cell">
                      {fmt(r.price_per_min_minor, r.currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-300 hidden lg:table-cell">
                      {fmt(r.booking_fee_minor, r.currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-300 hidden lg:table-cell">
                      {fmt(r.min_fare_minor, r.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.is_active
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {r.is_active ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                        aria-label="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDialogOpen(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">
                {editing ? 'Edit fare rule' : 'New fare rule'}
              </h3>
              <button
                onClick={() => setDialogOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">City</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">Vehicle type</label>
                  <input
                    value={form.vehicle_type}
                    onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">Currency</label>
                <input
                  value={form.currency ?? 'JMD'}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['base_fare', 'Base fare'],
                    ['price_per_km', 'Price per km'],
                    ['price_per_min', 'Price per min'],
                    ['booking_fee', 'Booking fee'],
                    ['min_fare', 'Min fare'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <label className="block text-sm font-medium text-slate-300">{label}</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active !== false}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50"
                />
                <label htmlFor="is_active" className="text-sm text-slate-300 cursor-pointer">
                  Active (only one active rule per city + vehicle)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-slate-800">
              <button
                onClick={() => setDialogOpen(false)}
                className="px-4 py-2 text-sm font-medium border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
