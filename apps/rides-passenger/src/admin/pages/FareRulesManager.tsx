import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FareRuleAdminDto, FareRuleAdminInput } from '../services/ridesAdminService';
import {
  createFareRule,
  deleteFareRule,
  listFareRules,
  updateFareRule,
  formatMoneyMinor,
} from '../services/ridesAdminService';
import { CaribbeanCountryCurrencyPicker } from '../components/CaribbeanCountryCurrencyPicker';
import {
  JamaicaLocationPicker,
  locationValueFromRule,
  type JamaicaLocationValue,
} from '../components/JamaicaLocationPicker';
import { VehicleTypeSelect } from '../components/VehicleTypeSelect';
import { useVehicleTypesContext } from '../context/VehicleTypesContext';
import { FareRuleActionsMenu } from '../components/FareRuleActionsMenu';
import { FareRuleDetailOverlay } from '../components/FareRuleDetailOverlay';
import {
  buildLocationKey,
  currencyForMarket,
  getCaribbeanCountry,
  isJamaicaMarket,
  JAMAICA_MARKET_SLUG,
  marketSlugFromLocationKey,
} from '@roam/business-config';

const DEFAULT_LOCATION: JamaicaLocationValue = { scope: 'country' };

const EMPTY_FORM: FareRuleAdminInput = {
  location_scope: 'country',
  vehicle_type: '',
  currency: '',
  is_active: true,
  base_fare: 0,
  price_per_km: 0,
  price_per_min: 0,
  booking_fee: 0,
  estimated_tolls: 0,
  min_fare: 0,
};

interface FareRulesManagerProps {
  accessToken: string | undefined;
}

function defaultServiceSlug(services: { slug: string }[]): string {
  return services[0]?.slug ?? '';
}

export function FareRulesManager({ accessToken }: FareRulesManagerProps) {
  const { vehicleTypeTableLabel, services } = useVehicleTypesContext();
  const [rules, setRules] = useState<FareRuleAdminDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FareRuleAdminDto | null>(null);
  const [form, setForm] = useState<FareRuleAdminInput>(EMPTY_FORM);
  const [countrySlug, setCountrySlug] = useState(JAMAICA_MARKET_SLUG);
  const [location, setLocation] = useState<JamaicaLocationValue>(DEFAULT_LOCATION);
  const [saving, setSaving] = useState(false);
  const [detailRule, setDetailRule] = useState<FareRuleAdminDto | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setDetailRule(null);
    setEditing(null);
    setCountrySlug(JAMAICA_MARKET_SLUG);
    const serviceSlug = defaultServiceSlug(services);
    setForm({
      ...EMPTY_FORM,
      vehicle_type: serviceSlug,
      currency: currencyForMarket(JAMAICA_MARKET_SLUG),
    });
    setLocation(DEFAULT_LOCATION);
    setDialogOpen(true);
  };

  const openEdit = (rule: FareRuleAdminDto) => {
    setDetailRule(null);
    setEditing(rule);
    const market = marketSlugFromLocationKey(rule.location_key ?? rule.city ?? JAMAICA_MARKET_SLUG);
    setCountrySlug(market);
    setLocation(locationValueFromRule(rule));
    setForm({
      location_scope: locationValueFromRule(rule).scope,
      county: rule.county ?? undefined,
      parish: rule.parish ?? undefined,
      locality: rule.locality ?? undefined,
      vehicle_type: rule.vehicle_type,
      currency: currencyForMarket(market),
      is_active: rule.is_active,
      base_fare: rule.base_fare,
      price_per_km: rule.price_per_km,
      price_per_min: rule.price_per_min,
      booking_fee: rule.booking_fee,
      estimated_tolls: rule.estimated_tolls ?? 0,
      min_fare: rule.min_fare,
    });
    setDialogOpen(true);
  };

  const confirmDelete = async (rule: FareRuleAdminDto) => {
    if (!accessToken) return;
    const label = rule.location_label ?? rule.location_key ?? rule.city;
    const vehicle = vehicleTypeTableLabel(rule.vehicle_type);
    if (
      !window.confirm(
        `Delete fare rule for ${label} (${vehicle})? This cannot be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await deleteFareRule(accessToken, rule.id);
      toast.success('Fare rule deleted');
      if (detailRule?.id === rule.id) setDetailRule(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const save = async () => {
    if (!accessToken) return;
    const serviceSlug = form.vehicle_type?.trim().toLowerCase() ?? '';
    if (!serviceSlug || !services.some((s) => s.slug === serviceSlug)) {
      toast.error('Select a service (Roam S, Comfort, Courier, etc.) before saving.');
      return;
    }
    if (
      form.base_fare <= 0 ||
      form.price_per_km <= 0 ||
      form.price_per_min <= 0 ||
      form.min_fare <= 0 ||
      form.booking_fee < 0 ||
      form.estimated_tolls < 0
    ) {
      toast.error('Enter all pricing amounts before saving (tolls and booking fee may be 0).');
      return;
    }
    setSaving(true);
    const locationKey = isJamaicaMarket(countrySlug)
      ? buildLocationKey(location)
      : countrySlug;
    const jamaicaLoc = isJamaicaMarket(countrySlug);
    const payload: FareRuleAdminInput = {
      ...form,
      currency: currencyForMarket(countrySlug),
      location_scope: jamaicaLoc ? location.scope : 'country',
      county: jamaicaLoc ? location.county : undefined,
      parish: jamaicaLoc ? location.parish : undefined,
      locality: jamaicaLoc ? location.locality : undefined,
      location_key: locationKey,
      city: locationKey,
    };
    try {
      if (editing) {
        await updateFareRule(accessToken, editing.id, payload);
        toast.success('Fare rule updated');
      } else {
        await createFareRule(accessToken, payload);
        toast.success('Fare rule created');
      }
      setDialogOpen(false);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      toast.error(
        msg.includes('duplicate')
          ? 'An active rule already exists for this location and vehicle'
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
            One active rule per service (Courier, Roam S, etc.); All Jamaica applies nationwide unless
            a parish or town rule overrides it.
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
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">
                  Location
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
                    No fare rules yet. Add a rule to get started.
                  </td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setDetailRule(r)}
                    className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-white text-sm">
                      {r.location_label ?? r.location_key ?? r.city}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <div>{vehicleTypeTableLabel(r.vehicle_type)}</div>
                      <div className="text-xs font-mono text-slate-500 mt-0.5">{r.vehicle_type}</div>
                    </td>
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
                      <FareRuleActionsMenu
                        rule={r}
                        onEdit={openEdit}
                        onDelete={(rule) => void confirmDelete(rule)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <FareRuleDetailOverlay
        rule={detailRule}
        onClose={() => setDetailRule(null)}
        onEdit={openEdit}
        onDelete={(rule) => void confirmDelete(rule)}
      />

      {dialogOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDialogOpen(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
              <CaribbeanCountryCurrencyPicker
                countrySlug={countrySlug}
                currencyCode={form.currency ?? currencyForMarket(countrySlug)}
                onCountryChange={(slug, code) => {
                  setCountrySlug(slug);
                  setForm((f) => ({ ...f, currency: code }));
                  if (!isJamaicaMarket(slug)) {
                    setLocation(DEFAULT_LOCATION);
                  }
                }}
              />

              {isJamaicaMarket(countrySlug) ? (
                <JamaicaLocationPicker value={location} onChange={setLocation} />
              ) : (
                <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2.5 text-sm text-slate-400">
                  Location: whole territory —{' '}
                  <span className="font-mono text-slate-300">{countrySlug}</span>
                  <span className="block mt-1 text-xs">
                    {getCaribbeanCountry(countrySlug)?.label ?? countrySlug}
                  </span>
                </div>
              )}

              <VehicleTypeSelect
                value={form.vehicle_type}
                onChange={(vehicle_type) => setForm((f) => ({ ...f, vehicle_type }))}
              />

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['base_fare', 'Base fare'],
                    ['price_per_km', 'Price per km'],
                    ['price_per_min', 'Price per min'],
                    ['booking_fee', 'Booking fee'],
                    ['estimated_tolls', 'Estimated tolls'],
                    ['min_fare', 'Min fare'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <label className="block text-sm font-medium text-slate-300">{label}</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form[key] === 0 ? '' : form[key]}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value;
                        setForm((f) => ({
                          ...f,
                          [key]: raw === '' ? 0 : Number(raw),
                        }));
                      }}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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
                  Active (only one active rule per location + vehicle)
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
                disabled={saving || deleting}
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
