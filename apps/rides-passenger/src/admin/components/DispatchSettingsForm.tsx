import React, { useCallback, useEffect, useState } from 'react';
import { HelpCircle, Loader2, Pencil, X, AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@roam/ui';
import type { DispatchSettingsDto } from '../services/ridesAdminService';
import {
  getDispatchSettings,
  updateDispatchSettings,
} from '../services/ridesAdminService';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';

const WRITE_ROLES = new Set(['platform_owner', 'superadmin', 'rides_admin']);

function isDeprecationEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const value = import.meta.env.VITE_CONTROL_PANEL_DEPRECATED;
  if (!value) return false;
  const normalized = String(value).toLowerCase().trim();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function DeprecationBanner() {
  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-2">
          <h3 className="font-medium text-amber-300">Control Panel Deprecated</h3>
          <p className="text-sm text-amber-200/80">
            This control panel has been superseded by the new{' '}
            <strong>Platform Matching Brain</strong> at{' '}
            <a
              href="https://roamdominion.co"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 underline underline-offset-2 hover:text-white inline-flex items-center gap-1"
            >
              roamdominion.co
              <ExternalLink className="w-3 h-3" />
            </a>
            . Settings here are read-only. All configuration changes should be made in the new admin portal.
          </p>
          <a
            href="https://roamdominion.co/admin/platform/matching-brain"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-lg text-sm mt-2"
          >
            Open Matching Brain
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

type SectionId = 'matching' | 'presence' | 'bodyType' | 'rollout' | 'automation' | 'waitTime' | 'pinVerification' | 'tollDetection' | 'quotes';

const SECTION_KEYS: Record<SectionId, (keyof DispatchSettingsDto)[]> = {
  matching: [
    'max_match_waves',
    'wave_radius_km',
    'max_offers_per_wave',
    'max_matching_duration_minutes',
    'default_driver_offer_timeout_seconds',
  ],
  presence: ['driver_location_max_age_minutes', 'require_body_type_for_offers'],
  bodyType: ['body_type_filtering_enabled', 'body_type_tier_mode'],
  rollout: ['independent_only_matching'],
  automation: [
    'trip_location_interval_seconds',
    'pickup_geofence_radius_m',
    'dropoff_geofence_radius_m',
    'arrival_dwell_seconds',
    'max_speed_mps_for_arrival',
    'gps_max_accuracy_m_for_arrival',
    'no_show_cancel_minutes',
    'auto_en_route_on_accept',
    'auto_arrive_enabled',
    'auto_complete_suggest_enabled',
    'no_show_auto_cancel_enabled',
  ],
  waitTime: [
    'wait_time_grace_minutes',
    'wait_time_rate_per_min_minor',
    'wait_time_max_minutes',
    'wait_time_charge_enabled',
  ],
  pinVerification: [
    'pin_verification_enabled',
    'pin_verification_required_for_start',
  ],
  tollDetection: [
    'toll_detection_enabled',
    'toll_geofence_radius_m',
    'toll_detect_enroute',
    'route_toll_estimation_enabled',
  ],
  quotes: ['quote_driver_radius_km'],
};

const TOOLTIPS = {
  max_match_waves:
    'How many search rounds run per ride. After each wave finishes (offers expire or are declined), the system widens the search radius. When all waves are exhausted with no accept, the ride is cancelled as no drivers available.',
  max_offers_per_wave:
    'Maximum drivers pinged at once in each wave. Higher values notify more drivers but may feel spammy.',
  max_matching_duration_minutes:
    'Hard ceiling: if a ride is still matching after this many minutes, the system auto-cancels (matching timeout). Also used by the database hygiene job. Should be at or above your intended max rider wait time.',
  default_driver_offer_timeout_seconds:
    'Seconds each driver has to accept or decline an offer before it expires and matching can advance to the next driver or wave.',
  wave_radius_km:
    'Maximum distance from pickup (km) for drivers considered in each wave. Each wave should use a larger radius than the previous.',
  driver_location_max_age_minutes:
    'Driver GPS must be updated within this window to count as online for matching and fare quotes.',
  require_body_type_for_offers:
    'When on, drivers without a registered body type are excluded from offers. When off, they may still receive offers if body-type filtering is enabled.',
  body_type_filtering_enabled:
    'When on, only drivers whose vehicle body type matches the booked service (per Transport Solutions links) are offered the ride. When off, matching uses distance only.',
  body_type_tier_mode:
    'Expand adds lower-priority body types in later waves. Strict keeps only the highest-priority types for every wave.',
  independent_only_matching:
    'Beta gate: when on, only independent drivers receive passenger offers and can go online for Roam dispatch. Fleet drivers keep the legacy START TRIP flow.',
  trip_location_interval_seconds:
    'How often the driver app sends GPS updates during an active trip (geofence and live map).',
  pickup_geofence_radius_m:
    'Radius around pickup where the driver is considered arrived for auto-arrive and dwell timers.',
  dropoff_geofence_radius_m:
    'Radius around drop-off where complete-trip suggestions and drop-off geofence logic apply.',
  arrival_dwell_seconds:
    'Driver must remain inside the pickup geofence this long before auto-arrive or no-show logic can fire.',
  max_speed_mps_for_arrival:
    'Maximum speed (m/s) allowed when evaluating geofence arrival — filters GPS jitter while driving past the pin.',
  gps_max_accuracy_m_for_arrival:
    'GPS fix must be at least this accurate (meters) before auto-arrive is allowed.',
  no_show_cancel_minutes:
    'After driver arrives at pickup, minutes to wait before a no-show cancel is allowed (when auto no-show is enabled).',
  auto_en_route_on_accept:
    'Automatically move the ride to en route to pickup when a driver accepts, without a manual tap.',
  auto_arrive_enabled:
    'Automatically mark driver arrived at pickup when geofence + dwell rules are satisfied.',
  auto_complete_suggest_enabled:
    'Prompt or suggest completing the trip when the driver enters the drop-off geofence.',
  no_show_auto_cancel_enabled:
    'Automatically cancel the ride when the rider no-shows after dwell at pickup. Off by default until QA sign-off.',
  quote_driver_radius_km:
    'Radius around pickup used on the fare quote to find nearby drivers and show pickup ETA on vehicle cards.',
  wait_time_grace_minutes:
    'Free wait time after the driver enters the pickup geofence. Billing starts once this period ends.',
  wait_time_rate_per_min_minor:
    'Per-minute rate for wait time in JMD cents. This rate is multiplied by surge if active.',
  wait_time_max_minutes:
    'Maximum minutes a driver waits before the system may auto-cancel. Should be greater than grace period.',
  wait_time_charge_enabled:
    'Enable wait time billing. When on, riders are charged per-minute after the grace period expires.',
  pin_verification_enabled:
    'Enable PIN generation for rides. Each ride shows a 4-digit PIN to the rider that the driver must verify.',
  pin_verification_required_for_start:
    'Require PIN verification before trip can start. Driver must enter the correct PIN to start the trip.',
  toll_detection_enabled:
    'Enable real-time toll detection during trips. Tolls are detected via geofence and added to the final fare.',
  toll_geofence_radius_m:
    'Radius around toll plazas for geofence detection. Driver must pass within this distance for toll to be recorded.',
  toll_detect_enroute:
    'Also detect tolls crossed while en route to pickup (deadhead), not only during the trip.',
  route_toll_estimation_enabled:
    'Use route polyline intersection for toll estimates on quotes. When off, fare rules static estimated tolls apply.',
} as const;

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

function SettingLabel({
  label,
  tip,
  variant = 'field',
}: {
  label: string;
  tip: string;
  variant?: 'field' | 'inline';
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={
          variant === 'field'
            ? 'text-xs text-slate-400 uppercase tracking-wide'
            : 'text-sm text-slate-300'
        }
      >
        {label}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-slate-500 hover:text-slate-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 rounded"
            aria-label={`About ${label}`}
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-slate-800 text-slate-100 border border-slate-700 text-left leading-snug"
        >
          {tip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

function sectionDisabled(canEdit: boolean, editing: boolean): boolean {
  return !canEdit || !editing;
}

interface SettingsSectionProps {
  title: string;
  description: string;
  canEdit: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  children: React.ReactNode;
}

function SettingsSection({
  title,
  description,
  canEdit,
  isEditing,
  isSaving,
  onEdit,
  onCancel,
  onSave,
  children,
}: SettingsSectionProps) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-medium text-white">{title}</h3>
          <p className="text-sm text-slate-400 mt-1">{description}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            {!isEditing ? (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-sm text-slate-200 hover:bg-slate-800"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white font-medium disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Save
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

export function DispatchSettingsForm({ accessToken, role }: DispatchSettingsFormProps) {
  const { confirm } = useAdminConfirm();
  const isDeprecated = isDeprecationEnabled();
  const canEdit = isDeprecated ? false : (role ? WRITE_ROLES.has(role) : false);

  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<SectionId | null>(null);
  const [form, setForm] = useState<DispatchSettingsDto | null>(null);
  const [editing, setEditing] = useState<Record<SectionId, boolean>>({
    matching: false,
    presence: false,
    bodyType: false,
    rollout: false,
    automation: false,
    waitTime: false,
    pinVerification: false,
    tollDetection: false,
    quotes: false,
  });
  const [snapshots, setSnapshots] = useState<Partial<Record<SectionId, Partial<DispatchSettingsDto>>>>({});

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

  const startEdit = (section: SectionId) => {
    if (!form) return;
    const snap: Partial<DispatchSettingsDto> = {};
    for (const key of SECTION_KEYS[section]) {
      snap[key] = form[key];
    }
    setSnapshots((prev) => ({ ...prev, [section]: snap }));
    setEditing((prev) => ({ ...prev, [section]: true }));
  };

  const cancelEdit = (section: SectionId) => {
    const snap = snapshots[section];
    if (snap && form) {
      setForm({ ...form, ...snap });
    }
    setEditing((prev) => ({ ...prev, [section]: false }));
  };

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

  const buildSectionPatch = (section: SectionId): Partial<DispatchSettingsDto> => {
    if (!form) return {};
    const patch: Partial<DispatchSettingsDto> = {};
    for (const key of SECTION_KEYS[section]) {
      patch[key] = form[key];
    }
    if (section === 'matching') {
      patch.wave_radius_km = form.wave_radius_km.slice(0, form.max_match_waves);
    }
    return patch;
  };

  const validateMatchingSection = async (): Promise<boolean> => {
    if (!form) return false;
    const radii = form.wave_radius_km.slice(0, form.max_match_waves);
    for (let i = 1; i < radii.length; i++) {
      if (radii[i] <= radii[i - 1]) {
        toast.error('Wave radii must increase with each wave');
        return false;
      }
    }
    const aggressive =
      form.max_offers_per_wave > 10 ||
      radii.some((r, i) => i > 0 && r > (form.wave_radius_km[i - 1] ?? 0) * 2);
    if (aggressive) {
      const ok = await confirm({
        title: 'Aggressive matching settings',
        description: 'These settings widen driver search or increase offers per wave. Save anyway?',
        confirmLabel: 'Save anyway',
        variant: 'danger',
      });
      if (!ok) return false;
    }
    return true;
  };

  const handleSaveSection = async (section: SectionId) => {
    if (!accessToken || !form || !canEdit) return;
    if (section === 'matching' && !(await validateMatchingSection())) return;

    setSavingSection(section);
    try {
      const { settings } = await updateDispatchSettings(accessToken, buildSectionPatch(section));
      setForm(settings);
      setEditing((prev) => ({ ...prev, [section]: false }));
      toast.success('Settings saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingSection(null);
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

  const inputClass =
    'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-8 max-w-2xl">
        {isDeprecated && <DeprecationBanner />}
        <SettingsSection
          title="Dispatch and matching"
          description="How far and how many times the system searches for drivers per ride."
          canEdit={canEdit}
          isEditing={editing.matching}
          isSaving={savingSection === 'matching'}
          onEdit={() => startEdit('matching')}
          onCancel={() => cancelEdit('matching')}
          onSave={() => void handleSaveSection('matching')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <SettingLabel label="Max matching waves" tip={TOOLTIPS.max_match_waves} />
              <input
                type="number"
                min={1}
                max={5}
                disabled={sectionDisabled(canEdit, editing.matching)}
                value={form.max_match_waves}
                onChange={(e) => setWaveCount(Number(e.target.value))}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <SettingLabel label="Offers per wave" tip={TOOLTIPS.max_offers_per_wave} />
              <input
                type="number"
                min={1}
                max={20}
                disabled={sectionDisabled(canEdit, editing.matching)}
                value={form.max_offers_per_wave}
                onChange={(e) =>
                  setForm({ ...form, max_offers_per_wave: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <SettingLabel
                label="Max matching duration (minutes)"
                tip={TOOLTIPS.max_matching_duration_minutes}
              />
              <input
                type="number"
                min={2}
                max={120}
                disabled={sectionDisabled(canEdit, editing.matching)}
                value={form.max_matching_duration_minutes}
                onChange={(e) =>
                  setForm({ ...form, max_matching_duration_minutes: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <SettingLabel
                label="Default offer timeout (seconds)"
                tip={TOOLTIPS.default_driver_offer_timeout_seconds}
              />
              <input
                type="number"
                min={5}
                max={120}
                disabled={sectionDisabled(canEdit, editing.matching)}
                value={form.default_driver_offer_timeout_seconds}
                onChange={(e) =>
                  setForm({
                    ...form,
                    default_driver_offer_timeout_seconds: Number(e.target.value),
                  })
                }
                className={inputClass}
              />
            </label>
          </div>

          <div className="space-y-3">
            <SettingLabel label="Wave search radius (km)" tip={TOOLTIPS.wave_radius_km} />
            {form.wave_radius_km.slice(0, form.max_match_waves).map((km, i) => (
              <label key={i} className="flex items-center gap-3">
                <span className="text-sm text-slate-300 w-16">Wave {i + 1}</span>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  disabled={sectionDisabled(canEdit, editing.matching)}
                  value={km}
                  onChange={(e) => setWaveRadius(i, Number(e.target.value))}
                  className={`flex-1 ${inputClass}`}
                />
              </label>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Driver presence"
          description="When a driver's GPS is considered fresh enough for matching and quotes."
          canEdit={canEdit}
          isEditing={editing.presence}
          isSaving={savingSection === 'presence'}
          onEdit={() => startEdit('presence')}
          onCancel={() => cancelEdit('presence')}
          onSave={() => void handleSaveSection('presence')}
        >
          <label className="block space-y-1.5">
            <SettingLabel
              label="Location max age (minutes)"
              tip={TOOLTIPS.driver_location_max_age_minutes}
            />
            <input
              type="number"
              min={1}
              max={30}
              disabled={sectionDisabled(canEdit, editing.presence)}
              value={form.driver_location_max_age_minutes}
              onChange={(e) =>
                setForm({ ...form, driver_location_max_age_minutes: Number(e.target.value) })
              }
              className={inputClass}
            />
          </label>

          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.presence) ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.presence)}
              checked={form.require_body_type_for_offers}
              onChange={(e) =>
                setForm({ ...form, require_body_type_for_offers: e.target.checked })
              }
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Require body type on driver to receive offers"
                tip={TOOLTIPS.require_body_type_for_offers}
              />
            </span>
          </label>
        </SettingsSection>

        <SettingsSection
          title="Body-type policy"
          description="How service ↔ body type links affect matching (configured under Transport Solutions)."
          canEdit={canEdit}
          isEditing={editing.bodyType}
          isSaving={savingSection === 'bodyType'}
          onEdit={() => startEdit('bodyType')}
          onCancel={() => cancelEdit('bodyType')}
          onSave={() => void handleSaveSection('bodyType')}
        >
          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.bodyType) ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.bodyType)}
              checked={form.body_type_filtering_enabled}
              onChange={(e) =>
                setForm({ ...form, body_type_filtering_enabled: e.target.checked })
              }
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Enable body-type filtering"
                tip={TOOLTIPS.body_type_filtering_enabled}
              />
            </span>
          </label>

          <label className="block space-y-1.5">
            <SettingLabel label="Tier expansion" tip={TOOLTIPS.body_type_tier_mode} />
            <select
              disabled={sectionDisabled(canEdit, editing.bodyType) || !form.body_type_filtering_enabled}
              value={form.body_type_tier_mode}
              onChange={(e) =>
                setForm({
                  ...form,
                  body_type_tier_mode: e.target.value as 'expand' | 'strict',
                })
              }
              className={inputClass}
            >
              <option value="expand">Expand — add lower-priority body types each wave</option>
              <option value="strict">Strict — only highest-priority body types</option>
            </select>
          </label>
        </SettingsSection>

        <SettingsSection
          title="Driver rollout"
          description="Control which Roam Driver accounts participate in passenger dispatch during beta."
          canEdit={canEdit}
          isEditing={editing.rollout}
          isSaving={savingSection === 'rollout'}
          onEdit={() => startEdit('rollout')}
          onCancel={() => cancelEdit('rollout')}
          onSave={() => void handleSaveSection('rollout')}
        >
          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.rollout) ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.rollout)}
              checked={form.independent_only_matching}
              onChange={(e) =>
                setForm({ ...form, independent_only_matching: e.target.checked })
              }
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Independent drivers only (beta)"
                tip={TOOLTIPS.independent_only_matching}
              />
            </span>
          </label>
        </SettingsSection>

        <SettingsSection
          title="In-trip automation"
          description="GPS geofencing and automatic status transitions. Toggle gradually in production."
          canEdit={canEdit}
          isEditing={editing.automation}
          isSaving={savingSection === 'automation'}
          onEdit={() => startEdit('automation')}
          onCancel={() => cancelEdit('automation')}
          onSave={() => void handleSaveSection('automation')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <SettingLabel
                label="Location interval (sec)"
                tip={TOOLTIPS.trip_location_interval_seconds}
              />
              <input
                type="number"
                min={2}
                max={30}
                disabled={sectionDisabled(canEdit, editing.automation)}
                value={form.trip_location_interval_seconds}
                onChange={(e) =>
                  setForm({ ...form, trip_location_interval_seconds: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <SettingLabel label="Pickup geofence (m)" tip={TOOLTIPS.pickup_geofence_radius_m} />
              <input
                type="number"
                min={20}
                max={500}
                disabled={sectionDisabled(canEdit, editing.automation)}
                value={form.pickup_geofence_radius_m}
                onChange={(e) =>
                  setForm({ ...form, pickup_geofence_radius_m: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <SettingLabel
                label="Drop-off geofence (m)"
                tip={TOOLTIPS.dropoff_geofence_radius_m}
              />
              <input
                type="number"
                min={20}
                max={500}
                disabled={sectionDisabled(canEdit, editing.automation)}
                value={form.dropoff_geofence_radius_m}
                onChange={(e) =>
                  setForm({ ...form, dropoff_geofence_radius_m: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <SettingLabel label="Arrival dwell (sec)" tip={TOOLTIPS.arrival_dwell_seconds} />
              <input
                type="number"
                min={0}
                max={120}
                disabled={sectionDisabled(canEdit, editing.automation)}
                value={form.arrival_dwell_seconds}
                onChange={(e) =>
                  setForm({ ...form, arrival_dwell_seconds: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <SettingLabel
                label="Max speed for arrive (m/s)"
                tip={TOOLTIPS.max_speed_mps_for_arrival}
              />
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                disabled={sectionDisabled(canEdit, editing.automation)}
                value={form.max_speed_mps_for_arrival}
                onChange={(e) =>
                  setForm({ ...form, max_speed_mps_for_arrival: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <SettingLabel label="GPS max accuracy (m)" tip={TOOLTIPS.gps_max_accuracy_m_for_arrival} />
              <input
                type="number"
                min={10}
                max={200}
                disabled={sectionDisabled(canEdit, editing.automation)}
                value={form.gps_max_accuracy_m_for_arrival}
                onChange={(e) =>
                  setForm({ ...form, gps_max_accuracy_m_for_arrival: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <SettingLabel
                label="No-show cancel after (min)"
                tip={TOOLTIPS.no_show_cancel_minutes}
              />
              <input
                type="number"
                min={0}
                max={60}
                disabled={sectionDisabled(canEdit, editing.automation)}
                value={form.no_show_cancel_minutes}
                onChange={(e) =>
                  setForm({ ...form, no_show_cancel_minutes: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
          </div>

          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.automation) ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.automation)}
              checked={form.auto_en_route_on_accept}
              onChange={(e) => setForm({ ...form, auto_en_route_on_accept: e.target.checked })}
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Auto en route on accept"
                tip={TOOLTIPS.auto_en_route_on_accept}
              />
            </span>
          </label>
          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.automation) ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.automation)}
              checked={form.auto_arrive_enabled}
              onChange={(e) => setForm({ ...form, auto_arrive_enabled: e.target.checked })}
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Auto arrive at pickup (geofence)"
                tip={TOOLTIPS.auto_arrive_enabled}
              />
            </span>
          </label>
          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.automation) ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.automation)}
              checked={form.auto_complete_suggest_enabled}
              onChange={(e) =>
                setForm({ ...form, auto_complete_suggest_enabled: e.target.checked })
              }
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Suggest complete at drop-off"
                tip={TOOLTIPS.auto_complete_suggest_enabled}
              />
            </span>
          </label>
          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.automation) ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.automation)}
              checked={form.no_show_auto_cancel_enabled}
              onChange={(e) =>
                setForm({ ...form, no_show_auto_cancel_enabled: e.target.checked })
              }
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Auto-cancel rider no-show (after dwell at pickup)"
                tip={TOOLTIPS.no_show_auto_cancel_enabled}
              />
            </span>
          </label>
        </SettingsSection>

        <SettingsSection
          title="Wait time billing"
          description="Charge riders when they make drivers wait beyond a grace period at pickup."
          canEdit={canEdit}
          isEditing={editing.waitTime}
          isSaving={savingSection === 'waitTime'}
          onEdit={() => startEdit('waitTime')}
          onCancel={() => cancelEdit('waitTime')}
          onSave={() => void handleSaveSection('waitTime')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <SettingLabel
                label="Grace period (minutes)"
                tip={TOOLTIPS.wait_time_grace_minutes}
              />
              <input
                type="number"
                min={0}
                max={10}
                disabled={sectionDisabled(canEdit, editing.waitTime)}
                value={form.wait_time_grace_minutes}
                onChange={(e) =>
                  setForm({ ...form, wait_time_grace_minutes: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <SettingLabel
                label="Rate per minute (JMD cents)"
                tip={TOOLTIPS.wait_time_rate_per_min_minor}
              />
              <input
                type="number"
                min={0}
                disabled={sectionDisabled(canEdit, editing.waitTime)}
                value={form.wait_time_rate_per_min_minor}
                onChange={(e) =>
                  setForm({ ...form, wait_time_rate_per_min_minor: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <SettingLabel
                label="Max wait before cancel (minutes)"
                tip={TOOLTIPS.wait_time_max_minutes}
              />
              <input
                type="number"
                min={1}
                max={60}
                disabled={sectionDisabled(canEdit, editing.waitTime)}
                value={form.wait_time_max_minutes}
                onChange={(e) =>
                  setForm({ ...form, wait_time_max_minutes: Number(e.target.value) })
                }
                className={inputClass}
              />
            </label>
          </div>

          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.waitTime) ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.waitTime)}
              checked={form.wait_time_charge_enabled}
              onChange={(e) =>
                setForm({ ...form, wait_time_charge_enabled: e.target.checked })
              }
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Enable wait time billing"
                tip={TOOLTIPS.wait_time_charge_enabled}
              />
            </span>
          </label>
        </SettingsSection>

        <SettingsSection
          title="PIN verification"
          description="Require driver to verify rider identity with a 4-digit PIN before starting the trip."
          canEdit={canEdit}
          isEditing={editing.pinVerification}
          isSaving={savingSection === 'pinVerification'}
          onEdit={() => startEdit('pinVerification')}
          onCancel={() => cancelEdit('pinVerification')}
          onSave={() => void handleSaveSection('pinVerification')}
        >
          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.pinVerification) ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.pinVerification)}
              checked={form.pin_verification_enabled}
              onChange={(e) =>
                setForm({ ...form, pin_verification_enabled: e.target.checked })
              }
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Enable PIN verification"
                tip={TOOLTIPS.pin_verification_enabled}
              />
            </span>
          </label>

          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.pinVerification) || !form.pin_verification_enabled ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.pinVerification) || !form.pin_verification_enabled}
              checked={form.pin_verification_required_for_start}
              onChange={(e) =>
                setForm({ ...form, pin_verification_required_for_start: e.target.checked })
              }
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Require PIN to start trip"
                tip={TOOLTIPS.pin_verification_required_for_start}
              />
            </span>
          </label>
        </SettingsSection>

        <SettingsSection
          title="Toll detection"
          description="Automatically detect and charge tolls when drivers pass through toll plazas during trips."
          canEdit={canEdit}
          isEditing={editing.tollDetection}
          isSaving={savingSection === 'tollDetection'}
          onEdit={() => startEdit('tollDetection')}
          onCancel={() => cancelEdit('tollDetection')}
          onSave={() => void handleSaveSection('tollDetection')}
        >
          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.tollDetection) ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.tollDetection)}
              checked={form.toll_detection_enabled}
              onChange={(e) =>
                setForm({ ...form, toll_detection_enabled: e.target.checked })
              }
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Enable toll detection"
                tip={TOOLTIPS.toll_detection_enabled}
              />
            </span>
          </label>

          <label className="block space-y-1.5">
            <SettingLabel
              label="Toll geofence radius (meters)"
              tip={TOOLTIPS.toll_geofence_radius_m}
            />
            <input
              type="number"
              min={50}
              max={500}
              disabled={sectionDisabled(canEdit, editing.tollDetection) || !form.toll_detection_enabled}
              value={form.toll_geofence_radius_m}
              onChange={(e) =>
                setForm({ ...form, toll_geofence_radius_m: Number(e.target.value) })
              }
              className={inputClass}
            />
          </label>

          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.tollDetection) || !form.toll_detection_enabled ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.tollDetection) || !form.toll_detection_enabled}
              checked={form.toll_detect_enroute ?? false}
              onChange={(e) =>
                setForm({ ...form, toll_detect_enroute: e.target.checked })
              }
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Detect tolls en route to pickup"
                tip={TOOLTIPS.toll_detect_enroute}
              />
            </span>
          </label>

          <label
            className={`flex items-start gap-3 ${sectionDisabled(canEdit, editing.tollDetection) ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              disabled={sectionDisabled(canEdit, editing.tollDetection)}
              checked={form.route_toll_estimation_enabled ?? false}
              onChange={(e) =>
                setForm({ ...form, route_toll_estimation_enabled: e.target.checked })
              }
              className="mt-1 rounded border-slate-600"
            />
            <span className="text-sm text-slate-300">
              <SettingLabel
                variant="inline"
                label="Route-based toll estimation on quotes"
                tip={TOOLTIPS.route_toll_estimation_enabled}
              />
            </span>
          </label>
        </SettingsSection>

        <SettingsSection
          title="Quotes"
          description="Radius used when estimating pickup ETA on the fare quote."
          canEdit={canEdit}
          isEditing={editing.quotes}
          isSaving={savingSection === 'quotes'}
          onEdit={() => startEdit('quotes')}
          onCancel={() => cancelEdit('quotes')}
          onSave={() => void handleSaveSection('quotes')}
        >
          <label className="block space-y-1.5">
            <SettingLabel
              label="Quote driver search radius (km)"
              tip={TOOLTIPS.quote_driver_radius_km}
            />
            <input
              type="number"
              min={1}
              max={50}
              step={0.5}
              disabled={sectionDisabled(canEdit, editing.quotes)}
              value={form.quote_driver_radius_km}
              onChange={(e) =>
                setForm({ ...form, quote_driver_radius_km: Number(e.target.value) })
              }
              className={inputClass}
            />
          </label>
        </SettingsSection>

        <p className="text-xs text-slate-500 pt-2">
          Last updated: {formatUpdatedAt(form.updated_at)}
          {isDeprecated ? (
            <span className="block mt-1 text-amber-500/90">
              Read-only — this control panel is deprecated. Use Matching Brain at roamdominion.co.
            </span>
          ) : !canEdit && (
            <span className="block mt-1 text-amber-500/90">
              Read-only — rides_admin or higher required to edit.
            </span>
          )}
        </p>
      </div>
    </TooltipProvider>
  );
}
