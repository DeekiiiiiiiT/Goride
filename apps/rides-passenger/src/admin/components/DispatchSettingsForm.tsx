import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { DispatchSettingsDto } from '../services/ridesAdminService';
import {
  getDispatchSettings,
  updateDispatchSettings,
} from '../services/ridesAdminService';

const WRITE_ROLES = new Set(['platform_owner', 'superadmin', 'rides_admin']);

interface DispatchSettingsFormProps {
  accessToken: string | undefined;
  role: string | undefined;
}

function formatUpdatedAt(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function DispatchSettingsForm({ accessToken, role }: DispatchSettingsFormProps) {
  const canEdit = role ? WRITE_ROLES.has(role) : false;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DispatchSettingsDto | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const { settings } = await getDispatchSettings(accessToken);
      setForm(settings);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load dispatch settings');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const setWaveCount = (count: number) => {
    if (!form) return;
    const n = Math.min(5, Math.max(1, count));
    const radii = [...form.wave_radius_km];
    while (radii.length < n) {
      radii.push(radii[radii.length - 1] ?? 35);
    }
    setForm({ ...form, max_match_waves: n, wave_radius_km: radii.slice(0, n) });
  };

  const setWaveRadius = (index: number, value: number) => {
    if (!form) return;
    const radii = [...form.wave_radius_km];
    radii[index] = value;
    setForm({ ...form, wave_radius_km: radii });
  };

  const handleSave = async () => {
    if (!accessToken || !form || !canEdit) return;

    const radii = form.wave_radius_km.slice(0, form.max_match_waves);
    for (let i = 1; i < radii.length; i++) {
      if (radii[i] <= radii[i - 1]) {
        toast.error('Wave radii must increase with each wave');
        return;
      }
    }

    const aggressive =
      form.max_offers_per_wave > 10 ||
      radii.some((r, i) => i > 0 && r > (form.wave_radius_km[i - 1] ?? 0) * 2);
    if (
      aggressive &&
      !window.confirm(
        'These settings widen driver search or increase offers per wave. Save anyway?',
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const { settings } = await updateDispatchSettings(accessToken, {
        max_match_waves: form.max_match_waves,
        wave_radius_km: radii,
        max_offers_per_wave: form.max_offers_per_wave,
        default_driver_offer_timeout_seconds: form.default_driver_offer_timeout_seconds,
        driver_location_max_age_minutes: form.driver_location_max_age_minutes,
        quote_driver_radius_km: form.quote_driver_radius_km,
        body_type_filtering_enabled: form.body_type_filtering_enabled,
        body_type_tier_mode: form.body_type_tier_mode,
        require_body_type_for_offers: form.require_body_type_for_offers,
        independent_only_matching: form.independent_only_matching,
      });
      setForm(settings);
      toast.success('Dispatch settings saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!form) {
    return <p className="text-sm text-slate-400">Could not load dispatch settings.</p>;
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 space-y-4">
        <div>
          <h3 className="text-base font-medium text-white">Dispatch and matching</h3>
          <p className="text-sm text-slate-400 mt-1">
            How far and how many times the system searches for drivers per ride.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-xs text-slate-400 uppercase tracking-wide">Max matching waves</span>
            <input
              type="number"
              min={1}
              max={5}
              disabled={!canEdit}
              value={form.max_match_waves}
              onChange={(e) => setWaveCount(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-slate-400 uppercase tracking-wide">Offers per wave</span>
            <input
              type="number"
              min={1}
              max={20}
              disabled={!canEdit}
              value={form.max_offers_per_wave}
              onChange={(e) =>
                setForm({ ...form, max_offers_per_wave: Number(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
            />
          </label>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs text-slate-400 uppercase tracking-wide">
              Default offer timeout (seconds)
            </span>
            <input
              type="number"
              min={5}
              max={120}
              disabled={!canEdit}
              value={form.default_driver_offer_timeout_seconds}
              onChange={(e) =>
                setForm({
                  ...form,
                  default_driver_offer_timeout_seconds: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
            />
          </label>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Wave search radius (km)</p>
          {form.wave_radius_km.slice(0, form.max_match_waves).map((km, i) => (
            <label key={i} className="flex items-center gap-3">
              <span className="text-sm text-slate-300 w-16">Wave {i + 1}</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                disabled={!canEdit}
                value={km}
                onChange={(e) => setWaveRadius(i, Number(e.target.value))}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 space-y-4">
        <div>
          <h3 className="text-base font-medium text-white">Driver presence</h3>
          <p className="text-sm text-slate-400 mt-1">
            When a driver&apos;s GPS is considered fresh enough for matching and quotes.
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs text-slate-400 uppercase tracking-wide">
            Location max age (minutes)
          </span>
          <input
            type="number"
            min={1}
            max={30}
            disabled={!canEdit}
            value={form.driver_location_max_age_minutes}
            onChange={(e) =>
              setForm({ ...form, driver_location_max_age_minutes: Number(e.target.value) })
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
          />
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={form.require_body_type_for_offers}
            onChange={(e) =>
              setForm({ ...form, require_body_type_for_offers: e.target.checked })
            }
            className="mt-1 rounded border-slate-600"
          />
          <span className="text-sm text-slate-300">
            Require body type on driver to receive offers
            <span className="block text-xs text-slate-500 mt-0.5">
              When off, drivers without a body type can still be offered rides if filtering is on.
            </span>
          </span>
        </label>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 space-y-4">
        <div>
          <h3 className="text-base font-medium text-white">Body-type policy</h3>
          <p className="text-sm text-slate-400 mt-1">
            How service ↔ body type links affect matching (configured under Transport Solutions).
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={form.body_type_filtering_enabled}
            onChange={(e) =>
              setForm({ ...form, body_type_filtering_enabled: e.target.checked })
            }
            className="mt-1 rounded border-slate-600"
          />
          <span className="text-sm text-slate-300">
            Enable body-type filtering
            <span className="block text-xs text-slate-500 mt-0.5">
              When off, matching uses distance only (ignores service body-type links).
            </span>
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Tier expansion</span>
          <select
            disabled={!canEdit || !form.body_type_filtering_enabled}
            value={form.body_type_tier_mode}
            onChange={(e) =>
              setForm({
                ...form,
                body_type_tier_mode: e.target.value as 'expand' | 'strict',
              })
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
          >
            <option value="expand">Expand — add lower-priority body types each wave</option>
            <option value="strict">Strict — only highest-priority body types</option>
          </select>
        </label>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 space-y-4">
        <div>
          <h3 className="text-base font-medium text-white">Driver rollout</h3>
          <p className="text-sm text-slate-400 mt-1">
            Control which Roam Driver accounts participate in passenger dispatch during beta.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={form.independent_only_matching}
            onChange={(e) =>
              setForm({ ...form, independent_only_matching: e.target.checked })
            }
            className="mt-1 rounded border-slate-600"
          />
          <span className="text-sm text-slate-300">
            Independent drivers only (beta)
            <span className="block text-xs text-slate-500 mt-0.5">
              When on, only independent drivers receive Roam passenger offers. Fleet drivers keep
              the legacy START TRIP flow until this is turned off.
            </span>
          </span>
        </label>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 space-y-4">
        <div>
          <h3 className="text-base font-medium text-white">Quotes</h3>
          <p className="text-sm text-slate-400 mt-1">
            Radius used when estimating pickup ETA on the fare quote.
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs text-slate-400 uppercase tracking-wide">
            Quote driver search radius (km)
          </span>
          <input
            type="number"
            min={1}
            max={50}
            step={0.5}
            disabled={!canEdit}
            value={form.quote_driver_radius_km}
            onChange={(e) =>
              setForm({ ...form, quote_driver_radius_km: Number(e.target.value) })
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60"
          />
        </label>
      </section>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
        <p className="text-xs text-slate-500">
          Last updated: {formatUpdatedAt(form.updated_at)}
          {!canEdit && (
            <span className="block mt-1 text-amber-500/90">
              Read-only — rides_admin or higher required to save.
            </span>
          )}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </button>
        )}
      </div>
    </div>
  );
}
