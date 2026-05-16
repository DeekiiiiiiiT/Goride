import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthContext';
import type { FareRuleAdminDto, FareRuleAdminInput } from '@roam/types';
import { formatMoneyMinor } from '@roam/types';
import {
  createFareRule,
  listFareRules,
  updateFareRule,
} from '../../../services/ridesAdminService';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { Checkbox } from '../../ui/checkbox';

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

export function FareRulesManager() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [rules, setRules] = useState<FareRuleAdminDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FareRuleAdminDto | null>(null);
  const [form, setForm] = useState<FareRuleAdminInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { rules: rows } = await listFareRules(token);
      setRules(rows);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load fare rules');
    } finally {
      setLoading(false);
    }
  }, [token]);

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
    if (!token) return;
    setSaving(true);
    try {
      if (editing) {
        await updateFareRule(token, editing.id, form);
        toast.success('Fare rule updated');
      } else {
        await createFareRule(token, form);
        toast.success('Fare rule created');
      }
      setDialogOpen(false);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      toast.error(
        msg.includes('duplicate')
          ? 'An active rule already exists for this city and vehicle'
          : msg,
      );
    } finally {
      setSaving(false);
    }
  };

  const fmt = (minor: number, currency: string) => formatMoneyMinor(minor, currency);

  return (
    <div className="p-6 space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Fare rules</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Control upfront pricing for Roam Rides (rider app) and driver offers. Amounts are in major
            units (e.g. JMD dollars). Quotes refresh within about one minute after you save.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Add rule
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400">City</TableHead>
                <TableHead className="text-slate-400">Vehicle</TableHead>
                <TableHead className="text-slate-400">Base</TableHead>
                <TableHead className="text-slate-400">Per km</TableHead>
                <TableHead className="text-slate-400">Per min</TableHead>
                <TableHead className="text-slate-400">Booking</TableHead>
                <TableHead className="text-slate-400">Min fare</TableHead>
                <TableHead className="text-slate-400">Active</TableHead>
                <TableHead className="text-slate-400 w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500 py-12">
                    No fare rules yet. Add Jamaica / standard to get started.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((r) => (
                  <TableRow key={r.id} className="border-slate-800">
                    <TableCell className="font-medium">{r.city}</TableCell>
                    <TableCell>{r.vehicle_type}</TableCell>
                    <TableCell className="tabular-nums">{fmt(r.base_fare_minor, r.currency)}</TableCell>
                    <TableCell className="tabular-nums">{fmt(r.price_per_km_minor, r.currency)}</TableCell>
                    <TableCell className="tabular-nums">{fmt(r.price_per_min_minor, r.currency)}</TableCell>
                    <TableCell className="tabular-nums">{fmt(r.booking_fee_minor, r.currency)}</TableCell>
                    <TableCell className="tabular-nums">{fmt(r.min_fare_minor, r.currency)}</TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.is_active
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {r.is_active ? 'Yes' : 'No'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                        aria-label="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit fare rule' : 'New fare rule'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  className="bg-slate-800 border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label>Vehicle type</Label>
                <Input
                  value={form.vehicle_type}
                  onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
                  className="bg-slate-800 border-slate-600"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input
                value={form.currency ?? 'JMD'}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="bg-slate-800 border-slate-600"
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
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form[key]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: Number(e.target.value) }))
                    }
                    className="bg-slate-800 border-slate-600"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_active"
                checked={form.is_active !== false}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v === true }))}
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Active (only one active rule per city + vehicle)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-slate-600">
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
