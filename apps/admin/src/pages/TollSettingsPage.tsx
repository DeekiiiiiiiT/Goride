import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '../components/ui/switch';
import {
  SettingsSection,
  SettingLabel,
  isSectionDisabled,
  settingsInputClass,
  toggleRowClass,
} from '../components/admin/shared/SettingsSection';
import { useSettingsSection } from '../hooks/useSettingsSection';
import { useAuth } from '../components/auth/AuthContext';
import {
  getTollDispatchSettings,
  updateTollDispatchSettings,
  type TollDispatchSettings,
} from '../services/platform/ridesDispatchSettingsService';
import { api } from '../services/api';
import {
  assessTollDetectionHealth,
  type TollDetectionHealth,
} from '../utils/tollDetectionHealth';

const WRITE_ROLES = new Set(['platform_owner', 'superadmin', 'rides_admin', 'super_admin', 'super admin']);

const SECTION_KEYS: (keyof TollDispatchSettings)[] = [
  'toll_detection_enabled',
  'toll_geofence_radius_m',
  'toll_round_trip_cooldown_ms',
  'toll_detect_enroute',
  'route_toll_estimation_enabled',
];

const TOOLTIPS = {
  toll_detection_enabled:
    'Enable real-time toll detection during trips. Tolls are detected via geofence and added to the final fare.',
  toll_geofence_radius_m:
    'Default radius around toll plazas for geofence detection. Used when a plaza has no per-plaza override.',
  toll_round_trip_cooldown_ms:
    'Minimum time between charging the same plaza again on one trip (round-trip / traffic jam guard).',
  toll_detect_enroute:
    'Also detect tolls crossed while en route to pickup (deadhead), not only during the trip. Keep off — deadhead is a driver expense.',
  route_toll_estimation_enabled:
    'Use route polyline intersection for toll estimates on quotes. When off, fare rules static estimated tolls apply.',
} as const;

function hasWriteAccess(role: string | undefined | null): boolean {
  if (!role) return false;
  return WRITE_ROLES.has(role);
}

type Props = {
  onNavigate?: (page: string) => void;
};

export function TollSettingsPage({ onNavigate }: Props) {
  const { session, role } = useAuth();
  const token = session?.access_token;
  const canEdit = hasWriteAccess(role);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<TollDispatchSettings | null>(null);
  const [health, setHealth] = useState<TollDetectionHealth | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [next, plazas, tollLogs] = await Promise.all([
        getTollDispatchSettings(token),
        api.getTollPlazas().catch(() => []),
        api.getTollLogs({ limit: 500 }).catch(() => ({ data: [] })),
      ]);
      setSettings(next);
      setHealth(
        assessTollDetectionHealth({
          settings: next,
          plazas,
          tollLogRows: (tollLogs?.data || []) as Array<Record<string, unknown>>,
        }),
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load toll settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = useCallback(
    async (patch: Partial<TollDispatchSettings>) => {
      if (!token) throw new Error('Not signed in');
      const next = await updateTollDispatchSettings(token, patch);
      setSettings(next);
      return next;
    },
    [token],
  );

  const {
    formData,
    isEditing,
    isSaving,
    error,
    startEdit,
    cancelEdit,
    saveChanges,
    updateField,
    resetData,
  } = useSettingsSection<TollDispatchSettings>({
    initialData: settings,
    sectionKeys: SECTION_KEYS,
    onSave: handleSave,
  });

  useEffect(() => {
    resetData(settings);
  }, [settings, resetData]);

  if (loading && !settings) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!formData) return null;

  const disabled = isSectionDisabled(canEdit, isEditing);
  const showHealthAlarm = health?.verificationGateClosed || health?.zeroCrossingAlarm;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Toll Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Platform toll detection and quote estimation flags for Roam Rides and fleet route replay.
        </p>
      </div>

      {showHealthAlarm && health && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="font-semibold">Toll detection health</p>
            <p>{health.summary}</p>
            {onNavigate && (
              <button
                type="button"
                className="text-amber-900 underline font-medium"
                onClick={() => onNavigate('toll-stations')}
              >
                Open Toll Database
              </button>
            )}
          </div>
        </div>
      )}

      {health && !showHealthAlarm && (
        <p className="text-xs text-slate-500">{health.summary}</p>
      )}

      <SettingsSection
        title="Toll detection & quotes"
        description="Automatically detect tolls during trips and estimate tolls on fare quotes."
        canEdit={canEdit}
        isEditing={isEditing}
        isSaving={isSaving}
        onEdit={startEdit}
        onCancel={cancelEdit}
        onSave={saveChanges}
        error={error}
      >
        <label className={`${toggleRowClass} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="Enable toll detection"
              tooltip={TOOLTIPS.toll_detection_enabled}
            />
            <p className="text-xs text-slate-500">Live GPS geofence charges during trips</p>
          </div>
          <Switch
            disabled={disabled}
            checked={formData.toll_detection_enabled}
            onCheckedChange={(checked) => updateField('toll_detection_enabled', checked)}
          />
        </label>

        <label className="block space-y-1.5 mt-4">
          <SettingLabel
            label="Default toll geofence radius (meters)"
            tooltip={TOOLTIPS.toll_geofence_radius_m}
          />
          <input
            type="number"
            min={50}
            max={500}
            disabled={disabled || !formData.toll_detection_enabled}
            value={formData.toll_geofence_radius_m}
            onChange={(e) =>
              updateField('toll_geofence_radius_m', parseInt(e.target.value, 10) || 100)
            }
            className={settingsInputClass}
          />
          <p className="text-xs text-slate-500">
            Applies to every plaza that uses the global default. Plazas with a per-plaza override in
            Toll Database keep their own radius.
          </p>
        </label>

        <label className="block space-y-1.5 mt-4">
          <SettingLabel
            label="Round-trip cooldown (seconds)"
            tooltip={TOOLTIPS.toll_round_trip_cooldown_ms}
          />
          <input
            type="number"
            min={0}
            max={3600}
            step={30}
            disabled={disabled || !formData.toll_detection_enabled}
            value={Math.round((formData.toll_round_trip_cooldown_ms ?? 300_000) / 1000)}
            onChange={(e) => {
              const sec = Math.max(0, Math.min(3600, parseInt(e.target.value, 10) || 0));
              updateField('toll_round_trip_cooldown_ms', sec * 1000);
            }}
            className={settingsInputClass}
          />
          <p className="text-xs text-slate-500">
            Same plaza will not charge again within this window on one trip (default 300s).
          </p>
        </label>

        <label className={`${toggleRowClass} mt-4 ${disabled || !formData.toll_detection_enabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="Detect tolls en route to pickup"
              tooltip={TOOLTIPS.toll_detect_enroute}
            />
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Keep off — deadhead tolls are a driver expense, not rider charges.
            </p>
          </div>
          <Switch
            disabled={disabled || !formData.toll_detection_enabled}
            checked={formData.toll_detect_enroute}
            onCheckedChange={(checked) => updateField('toll_detect_enroute', checked)}
          />
        </label>

        <label className={`${toggleRowClass} mt-4 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
          <div className="space-y-0.5">
            <SettingLabel
              variant="inline"
              label="Route-based toll estimation on quotes"
              tooltip={TOOLTIPS.route_toll_estimation_enabled}
            />
            <p className="text-xs text-slate-500">Uses route polyline × plaza geofences on booking</p>
          </div>
          <Switch
            disabled={disabled}
            checked={formData.route_toll_estimation_enabled}
            onCheckedChange={(checked) => updateField('route_toll_estimation_enabled', checked)}
          />
        </label>
      </SettingsSection>
    </div>
  );
}
